import { Router } from 'express';
import { many, one } from '../db.js';
import { requireAuth } from '../middleware.js';
import { autoCloseChallenges } from './challenges.js';
import { projectProgress } from './projects.js';
import { profileStatus } from './profiles.js';
import { adminSummary } from './admin.js';

const router = Router();

// FR 11.1 / 11.2 / 11.3 Role specific dashboards.
// Any user can both apply and own challenges (FR 4.1), so the dashboard
// returns both sections and the interface leads with the user's main role.
router.get('/dashboard', requireAuth, async (req, res) => {
  await autoCloseChallenges();
  const uid = req.user.id;

  if (req.user.role === 'admin') {
    return res.json({ role: 'admin', admin: await adminSummary() });
  }

  const applications = await many(
    `SELECT a.id, a.status, a.created_at, c.id AS challenge_id, c.title AS challenge_title
       FROM applications a JOIN challenges c ON c.id = a.challenge_id
      WHERE a.participant_id = $1 ORDER BY a.created_at DESC LIMIT 10`,
    [uid]
  );
  const invitations = await many(
    `SELECT i.id, i.status, c.title AS challenge_title, c.id AS challenge_id
       FROM invitations i JOIN applications a ON a.id = i.application_id
       JOIN challenges c ON c.id = a.challenge_id
      WHERE a.participant_id = $1 AND i.status = 'sent' ORDER BY i.created_at DESC`,
    [uid]
  );
  const projects = await many(
    `SELECT p.id, p.name, p.status, c.title AS challenge_title, (p.owner_id = $1) AS is_owner
       FROM projects p JOIN challenges c ON c.id = p.challenge_id
       JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
      WHERE p.status = 'active' ORDER BY p.created_at DESC`,
    [uid]
  );
  for (const p of projects) p.progress = (await projectProgress(p.id)).percent;

  const challenges = await many(
    `SELECT c.id, c.title, c.status, c.deadline,
            (SELECT count(*)::int FROM applications a WHERE a.challenge_id = c.id AND a.status <> 'withdrawn') AS application_count,
            (SELECT count(*)::int FROM applications a WHERE a.challenge_id = c.id AND a.status IN ('submitted','under_review')) AS pending_count,
            (SELECT id FROM projects WHERE challenge_id = c.id) AS project_id
       FROM challenges c WHERE c.owner_id = $1 AND c.status <> 'removed'
      ORDER BY c.created_at DESC`,
    [uid]
  );
  const received = await one(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE a.status IN ('submitted','under_review'))::int AS pending
       FROM applications a JOIN challenges c ON c.id = a.challenge_id
      WHERE c.owner_id = $1 AND a.status <> 'withdrawn'`,
    [uid]
  );
  const org = await one('SELECT id, name, status, rejection_reason FROM organisations WHERE rep_user_id = $1', [uid]);

  res.json({
    role: req.user.role,
    profile: await profileStatus(uid),
    organisation: org,
    participant: { applications, invitations, projects },
    owner: { challenges, received },
  });
});

export default router;
