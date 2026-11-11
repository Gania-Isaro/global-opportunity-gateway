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

