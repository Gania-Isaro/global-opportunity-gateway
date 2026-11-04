import { Router } from 'express';
import { one, many, query } from '../db.js';
import { fail, requireAuth, requireVerified } from '../middleware.js';
import { validate, idParam } from '../validate.js';
import { profileStatus } from './profiles.js';

const router = Router();

export const SECTORS = [
  'Agriculture', 'Education', 'Health', 'Environment', 'Technology', 'Finance',
  'Energy', 'Transport', 'Tourism', 'Community', 'Other',
];

// FR 4.4 Auto-close: any published challenge whose deadline has passed is closed.
export async function autoCloseChallenges() {
  const { rowCount } = await query(
    `UPDATE challenges SET status = 'closed', closed_at = now()
      WHERE status = 'published' AND deadline < CURRENT_DATE`
  );
  return rowCount;
}

const CHALLENGE_SELECT = `
  SELECT c.*, p.full_name AS owner_name,
         o.id AS org_id, o.name AS org_name, (o.status = 'verified') AS verified,
         (SELECT count(*)::int FROM applications a WHERE a.challenge_id = c.id AND a.status <> 'withdrawn') AS application_count
    FROM challenges c
    JOIN profiles p ON p.user_id = c.owner_id
    LEFT JOIN organisations o ON o.id = c.org_id`;

const challengeRules = {
  title: { required: true, label: 'Title', max: 160 },
  description: { required: true, label: 'Description', max: 5000 },
  sector: { required: true, type: 'enum', values: SECTORS, label: 'Sector' },
  skills: { required: true, type: 'list', label: 'Skills needed' },
  outcome: { required: true, label: 'Expected outcome', max: 2000 },
  deadline: { required: true, type: 'date', label: 'Application deadline' },
  team_size: { required: true, type: 'int', min: 1, max: 50, label: 'Team size' },
};

// BR 1: a verified email and a complete profile are needed to create or publish.
async function assertCanOwn(user) {
  if (!user.email_verified) fail(403, 'Please confirm your email address first.');
  const status = await profileStatus(user.id);
  if (!status.complete) {
    fail(403, `Complete your profile before creating a challenge. Missing: ${status.missing.join(', ')}.`);
  }
}

function assertFutureDeadline(deadline) {
  const today = new Date().toISOString().slice(0, 10);
  if (deadline < today) fail(400, 'Please fix the highlighted fields.', { deadline: 'The deadline cannot be in the past.' });
}

async function loadOwned(req) {
  const c = await one('SELECT * FROM challenges WHERE id = $1', [idParam(req.params.id)]);
  if (!c) fail(404, 'Challenge not found.');
  if (c.owner_id !== req.user.id) fail(403, 'Only the owner of this challenge can change it.'); // FR 4.5
  if (c.status === 'removed') fail(400, 'This challenge was removed by an administrator.');
  return c;
}

// FR 5.1 List, FR 5.2 Search, FR 5.3 Filter
router.get('/challenges', async (req, res) => {
  await autoCloseChallenges();
  const where = [];
  const params = [];
  const status = req.query.status === 'closed' ? 'closed' : req.query.status === 'all' ? null : 'published';
  if (status) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  } else {
    where.push("c.status IN ('published', 'closed')");
  }
  if (req.query.q) {
    params.push(`%${String(req.query.q).trim()}%`);
    const n = params.length;
    where.push(`(c.title ILIKE $${n} OR c.description ILIKE $${n} OR c.outcome ILIKE $${n} OR array_to_string(c.skills, ' ') ILIKE $${n})`);
  }
  if (req.query.sector) {
    params.push(String(req.query.sector));
    where.push(`c.sector = $${params.length}`);
  }
  if (req.query.skill) {
    params.push(String(req.query.skill).toLowerCase());
    where.push(`EXISTS (SELECT 1 FROM unnest(c.skills) s WHERE lower(s) = $${params.length})`);
  }
  if (req.query.deadline_before && /^\d{4}-\d{2}-\d{2}$/.test(req.query.deadline_before)) {
    params.push(req.query.deadline_before);
    where.push(`c.deadline <= $${params.length}`);
  }
  if (req.query.verified === 'true') where.push("o.status = 'verified'");

  const rows = await many(
    `${CHALLENGE_SELECT} WHERE ${where.join(' AND ')} ORDER BY c.deadline ASC, c.id DESC LIMIT 200`,
    params
  );
  res.json({ challenges: rows });
});

// Values for the filter dropdowns.
router.get('/challenges/meta', async (req, res) => {
  const skills = await many(
    `SELECT DISTINCT s AS skill FROM challenges, unnest(skills) s
      WHERE status IN ('published', 'closed') ORDER BY 1`
  );
  res.json({ sectors: SECTORS, skills: skills.map((r) => r.skill) });
});

router.get('/challenges/mine', requireAuth, async (req, res) => {
  await autoCloseChallenges();
  const rows = await many(
    `SELECT x.*, (SELECT id FROM projects WHERE challenge_id = x.id) AS project_id,
            (SELECT count(*)::int FROM applications a
              WHERE a.challenge_id = x.id AND a.status IN ('submitted', 'under_review')) AS pending_count
       FROM (${CHALLENGE_SELECT} WHERE c.owner_id = $1) x
      ORDER BY x.created_at DESC`,
    [req.user.id]
  );
  res.json({ challenges: rows });
});

// FR 5.4 View details
router.get('/challenges/:id', async (req, res) => {
  await autoCloseChallenges();
  const c = await one(`${CHALLENGE_SELECT} WHERE c.id = $1`, [idParam(req.params.id)]);
  const isOwner = req.user && c && c.owner_id === req.user.id;
  const isAdmin = req.user?.role === 'admin';
  if (!c || (!['published', 'closed'].includes(c.status) && !isOwner && !isAdmin)) {
    fail(404, 'Challenge not found.');
  }
  let myApplication = null;
  if (req.user) {
    myApplication = await one(
      'SELECT id, status, created_at FROM applications WHERE challenge_id = $1 AND participant_id = $2',
      [c.id, req.user.id]
    );
  }
  const project = await one('SELECT id, name, status FROM projects WHERE challenge_id = $1', [c.id]);
  res.json({ challenge: c, isOwner: Boolean(isOwner), myApplication, project });
});

// FR 4.1 Create (saved as a draft or published straight away, FR 4.2)
router.post('/challenges', requireVerified, async (req, res) => {
  await assertCanOwn(req.user);
  const d = validate(req.body, challengeRules);
  const publish = req.body?.publish === true;
  if (publish) assertFutureDeadline(d.deadline);
  const org = await one(
    "SELECT id FROM organisations WHERE rep_user_id = $1 AND status <> 'rejected'",
    [req.user.id]
  );
  const c = await one(
    `INSERT INTO challenges (owner_id, org_id, title, description, sector, skills, outcome, deadline, team_size, status, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.user.id, org?.id || null, d.title, d.description, d.sector, d.skills, d.outcome, d.deadline,
      d.team_size, publish ? 'published' : 'draft', publish ? new Date() : null]
  );
  res.status(201).json({ challenge: c, message: publish ? 'Challenge published.' : 'Draft saved.' });
});

// FR 4.2 Edit (FR 4.5 owner only)
router.put('/challenges/:id', requireVerified, async (req, res) => {
  const c = await loadOwned(req);
  if (c.status === 'closed') fail(400, 'A closed challenge cannot be edited.');
  const d = validate(req.body, challengeRules);
  if (c.status === 'published') assertFutureDeadline(d.deadline);
  const updated = await one(
    `UPDATE challenges SET title=$2, description=$3, sector=$4, skills=$5, outcome=$6, deadline=$7, team_size=$8
      WHERE id=$1 RETURNING *`,
    [c.id, d.title, d.description, d.sector, d.skills, d.outcome, d.deadline, d.team_size]
  );
  res.json({ challenge: updated, message: 'Challenge saved.' });
});

// FR 4.2 Publish
router.post('/challenges/:id/publish', requireVerified, async (req, res) => {
  const c = await loadOwned(req);
  await assertCanOwn(req.user);
  if (c.status !== 'draft') fail(400, 'Only drafts can be published.');
  assertFutureDeadline(c.deadline);
  await query("UPDATE challenges SET status='published', published_at=now() WHERE id=$1", [c.id]);
  res.json({ message: 'Challenge published.' });
});

// FR 4.3 Close (BR 9: a closed challenge accepts no more applications)
router.post('/challenges/:id/close', requireVerified, async (req, res) => {
  const c = await loadOwned(req);
  if (c.status !== 'published') fail(400, 'Only published challenges can be closed.');
  await query("UPDATE challenges SET status='closed', closed_at=now() WHERE id=$1", [c.id]);
  res.json({ message: 'Challenge closed. It no longer accepts applications.' });
});

router.delete('/challenges/:id', requireVerified, async (req, res) => {
  const c = await loadOwned(req);
  if (c.status !== 'draft') fail(400, 'Only drafts can be deleted. Close a published challenge instead.');
  await query('DELETE FROM challenges WHERE id = $1', [c.id]);
  res.json({ message: 'Draft deleted.' });
});

export default router;
