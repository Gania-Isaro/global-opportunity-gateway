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

