import { Router } from 'express';
import { one, many, query, tx } from '../db.js';
import { fail, requireAuth, requireVerified } from '../middleware.js';
import { validate, idParam } from '../validate.js';
import { notify } from '../notify.js';
import { autoCloseChallenges } from './challenges.js';

const router = Router();

async function ownedChallenge(id, user) {
  const c = await one('SELECT * FROM challenges WHERE id = $1', [id]);
  if (!c) fail(404, 'Challenge not found.');
  if (c.owner_id !== user.id) fail(403, 'Only the challenge owner can do that.'); // BR 2
  return c;
}

async function applicationForOwner(appId, user) {
  const a = await one(
    `SELECT a.*, c.owner_id, c.title AS challenge_title, c.id AS challenge_id
       FROM applications a JOIN challenges c ON c.id = a.challenge_id WHERE a.id = $1`,
    [appId]
  );
  if (!a) fail(404, 'Application not found.');
  if (a.owner_id !== user.id) fail(403, 'Only the challenge owner can do that.');
  return a;
}

// FR 6.1 Apply (FR 6.2 no duplicates, FR 6.3 / BR 4 no self application, BR 9 closed challenges)
router.post('/challenges/:id/applications', requireVerified, async (req, res) => {
  if (req.user.role === 'admin') fail(403, 'Administrators cannot apply to challenges.');
  await autoCloseChallenges();
  const c = await one('SELECT * FROM challenges WHERE id = $1', [idParam(req.params.id)]);
  if (!c || !['published', 'closed'].includes(c.status)) fail(404, 'Challenge not found.');
  if (c.status !== 'published') fail(400, 'This challenge is closed and no longer accepts applications.');
  if (c.owner_id === req.user.id) fail(400, 'You cannot apply to a challenge you own.');
  const { motivation } = validate(req.body, {
    motivation: { required: true, label: 'Motivation statement', max: 1500 },
  });
  if (motivation.length < 20) {
    fail(400, 'Please fix the highlighted fields.', { motivation: 'Tell the owner a little more (at least 20 characters).' });
  }
  const dup = await one('SELECT id FROM applications WHERE challenge_id = $1 AND participant_id = $2', [c.id, req.user.id]);
  if (dup) fail(400, 'You have already applied to this challenge.');

  const a = await one(
    'INSERT INTO applications (challenge_id, participant_id, motivation) VALUES ($1, $2, $3) RETURNING *',
    [c.id, req.user.id, motivation]
  );
  await notify(
    c.owner_id,
    'new_application',
    `${req.user.full_name || 'A participant'} applied to "${c.title}".`,
    `/my-challenges/${c.id}/applications`
  );
  res.status(201).json({ application: a, message: 'Application submitted.' });
});

// FR 6.4 Track status
router.get('/applications/mine', requireAuth, async (req, res) => {
  const rows = await many(
    `SELECT a.id, a.status, a.motivation, a.created_at, a.decided_at,
            c.id AS challenge_id, c.title AS challenge_title, c.status AS challenge_status, c.deadline,
            i.id AS invitation_id, i.status AS invitation_status,
            pm.project_id
       FROM applications a
       JOIN challenges c ON c.id = a.challenge_id
       LEFT JOIN invitations i ON i.application_id = a.id
       LEFT JOIN projects p ON p.challenge_id = c.id
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = a.participant_id
      WHERE a.participant_id = $1
      ORDER BY a.created_at DESC`,
    [req.user.id]
  );
  res.json({ applications: rows });
});

// FR 6.5 Withdraw
router.post('/applications/:id/withdraw', requireAuth, async (req, res) => {
  const a = await one('SELECT a.*, c.owner_id, c.title FROM applications a JOIN challenges c ON c.id = a.challenge_id WHERE a.id = $1', [idParam(req.params.id)]);
  if (!a || a.participant_id !== req.user.id) fail(404, 'Application not found.');
  if (!['submitted', 'under_review'].includes(a.status)) {
    fail(400, 'Only applications that are still waiting for a decision can be withdrawn.');
  }
  await query("UPDATE applications SET status = 'withdrawn', decided_at = now() WHERE id = $1", [a.id]);
  await notify(a.owner_id, 'application_withdrawn', `An applicant withdrew from "${a.title}".`, `/my-challenges/${a.challenge_id}/applications`);
  res.json({ message: 'Application withdrawn.' });
});

// FR 7.1 View applications. Opening the list moves new applications to Under Review.
router.get('/challenges/:id/applications', requireAuth, async (req, res) => {
  const c = await ownedChallenge(idParam(req.params.id), req.user);
  await query(
    "UPDATE applications SET status = 'under_review' WHERE challenge_id = $1 AND status = 'submitted'",
    [c.id]
  );
  const applications = await many(
    `SELECT a.id, a.status, a.motivation, a.created_at, a.decided_at, a.participant_id,
            p.full_name, p.bio, p.skills, p.education, p.location, p.interests, p.experiences,
            u.email,
            i.id AS invitation_id, i.status AS invitation_status,
            (pm.user_id IS NOT NULL) AS in_team
       FROM applications a
       JOIN profiles p ON p.user_id = a.participant_id
       JOIN users u ON u.id = a.participant_id
       LEFT JOIN invitations i ON i.application_id = a.id
       LEFT JOIN projects pr ON pr.challenge_id = a.challenge_id
       LEFT JOIN project_members pm ON pm.project_id = pr.id AND pm.user_id = a.participant_id
      WHERE a.challenge_id = $1 AND a.status <> 'withdrawn'
      ORDER BY a.created_at ASC`,
    [c.id]
  );
  const project = await one('SELECT id, name, status FROM projects WHERE challenge_id = $1', [c.id]);
  res.json({ challenge: c, applications, project });
});

// FR 7.2 Accept or reject, FR 7.3 notify the applicant
router.post('/applications/:id/decision', requireAuth, async (req, res) => {
  const a = await applicationForOwner(idParam(req.params.id), req.user);
  const { decision } = validate(req.body, {
    decision: { required: true, type: 'enum', values: ['accepted', 'rejected'], label: 'Decision' },
  });
  if (!['submitted', 'under_review'].includes(a.status)) fail(400, 'A decision has already been made on this application.');
  await query('UPDATE applications SET status = $2, decided_at = now() WHERE id = $1', [a.id, decision]);
  const msg = decision === 'accepted'
    ? `Good news: your application to "${a.challenge_title}" was accepted. Watch for an invitation to join the team.`
    : `Your application to "${a.challenge_title}" was not selected this time. Thank you for applying.`;
  await notify(a.participant_id, 'application_decision', msg, '/applications');
  res.json({ message: decision === 'accepted' ? 'Application accepted.' : 'Application rejected.' });
});

// FR 7.4 Send an invitation to an accepted participant
router.post('/applications/:id/invite', requireAuth, async (req, res) => {
  const a = await applicationForOwner(idParam(req.params.id), req.user);
  if (a.status !== 'accepted') fail(400, 'Only accepted applicants can be invited.');
  const existing = await one('SELECT id FROM invitations WHERE application_id = $1', [a.id]);
  if (existing) fail(400, 'An invitation has already been sent.');
  await query('INSERT INTO invitations (application_id) VALUES ($1)', [a.id]);
  await notify(
    a.participant_id,
    'invitation',
    `You are invited to join the team for "${a.challenge_title}". Please confirm or decline.`,
    '/invitations'
  );
  res.json({ message: 'Invitation sent.' });
});

router.get('/invitations/mine', requireAuth, async (req, res) => {
  const rows = await many(
    `SELECT i.id, i.status, i.created_at, i.responded_at,
            c.id AS challenge_id, c.title AS challenge_title, p.full_name AS owner_name
       FROM invitations i
       JOIN applications a ON a.id = i.application_id
       JOIN challenges c ON c.id = a.challenge_id
       JOIN profiles p ON p.user_id = c.owner_id
      WHERE a.participant_id = $1
      ORDER BY i.created_at DESC`,
    [req.user.id]
  );
  res.json({ invitations: rows });
});

// FR 7.4 The participant confirms or declines
router.post('/invitations/:id/respond', requireAuth, async (req, res) => {
  const inv = await one(
    `SELECT i.*, a.participant_id, c.owner_id, c.title, c.id AS challenge_id
       FROM invitations i JOIN applications a ON a.id = i.application_id
       JOIN challenges c ON c.id = a.challenge_id WHERE i.id = $1`,
    [idParam(req.params.id)]
  );
  if (!inv || inv.participant_id !== req.user.id) fail(404, 'Invitation not found.');
  if (inv.status !== 'sent') fail(400, 'You have already responded to this invitation.');
  const { response } = validate(req.body, {
    response: { required: true, type: 'enum', values: ['confirmed', 'declined'], label: 'Response' },
  });
  await query('UPDATE invitations SET status = $2, responded_at = now() WHERE id = $1', [inv.id, response]);
  await notify(
    inv.owner_id,
    'invitation_response',
    `${req.user.full_name} ${response === 'confirmed' ? 'confirmed' : 'declined'} the invitation for "${inv.title}".`,
    `/my-challenges/${inv.challenge_id}/applications`
  );
  res.json({ message: response === 'confirmed' ? 'You confirmed the invitation.' : 'You declined the invitation.' });
});

// FR 8.1 Form team and FR 8.2 create the project (BR 5 at least one member, BR 6 one project per challenge)
router.post('/challenges/:id/project', requireAuth, async (req, res) => {
  const c = await ownedChallenge(idParam(req.params.id), req.user);
  const d = validate(req.body, {
    name: { required: true, label: 'Project name', max: 160 },
    members: { type: 'list', default: [] },
  });
  const ids = d.members.map(Number).filter(Number.isInteger);
  const confirmed = await many(
    `SELECT a.participant_id FROM applications a JOIN invitations i ON i.application_id = a.id
      WHERE a.challenge_id = $1 AND i.status = 'confirmed'`,
    [c.id]
  );
  const allowed = new Set(confirmed.map((r) => r.participant_id));
  const chosen = ids.length ? ids.filter((id) => allowed.has(id)) : [...allowed];
  if (chosen.length < 1) {
    fail(400, 'At least one participant must confirm their invitation before you can form a team.');
  }
  if (ids.some((id) => !allowed.has(id))) fail(400, 'Only participants who confirmed their invitation can join the team.');

  const project = await tx(async (cl) => {
    const exists = await cl.query('SELECT id FROM projects WHERE challenge_id = $1', [c.id]);
    if (exists.rowCount) fail(400, 'A project already exists for this challenge.');
    const { rows: [p] } = await cl.query(
      'INSERT INTO projects (challenge_id, owner_id, name) VALUES ($1, $2, $3) RETURNING *',
      [c.id, req.user.id, d.name]
    );
    await cl.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'Project owner')", [p.id, req.user.id]);
    for (const uid of chosen) {
      await cl.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'Member')", [p.id, uid]);
    }
    return p;
  });
  for (const uid of chosen) {
    await notify(uid, 'team_formed', `The team for "${c.title}" has been formed. Your private workspace is ready.`, `/projects/${project.id}`);
  }
  res.status(201).json({ project, message: 'Team formed and project workspace created.' });
});

export default router;
