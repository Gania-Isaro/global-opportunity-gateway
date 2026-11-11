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

