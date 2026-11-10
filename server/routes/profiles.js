import { Router } from 'express';
import { one, query } from '../db.js';
import { fail, requireAuth } from '../middleware.js';
import { validate, idParam } from '../validate.js';

const router = Router();

// A profile is complete when it has the details an owner needs to judge
// an applicant. BR 1 requires this before publishing a challenge.
export async function profileStatus(userId) {
  const p = await one('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  const missing = [];
  if (!p?.full_name) missing.push('full name');
  if (!p?.bio) missing.push('short bio');
  if (!p?.skills?.length) missing.push('skills');
  if (!p?.location) missing.push('location');
  return { complete: missing.length === 0, missing };
}

// FR 2.1 / 2.2 Manage own profile
router.get('/profile', requireAuth, async (req, res) => {
  const profile = await one('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
  res.json({ profile, status: await profileStatus(req.user.id) });
});

router.put('/profile', requireAuth, async (req, res) => {
  const d = validate(req.body, {
    full_name: { required: true, label: 'Full name', max: 120 },
    bio: { label: 'Bio', max: 600, default: '' },
    skills: { type: 'list', default: [] },
    education: { max: 300, default: '' },
    location: { max: 120, default: '' },
    interests: { max: 600, default: '' },
    experiences: { max: 2000, default: '' },
  });
  await query(
    `UPDATE profiles SET full_name = $2, bio = $3, skills = $4, education = $5, location = $6,
            interests = $7, experiences = $8, updated_at = now()
      WHERE user_id = $1`,
    [req.user.id, d.full_name, d.bio, d.skills, d.education, d.location, d.interests, d.experiences]
  );
  res.json({ message: 'Profile saved.', status: await profileStatus(req.user.id) });
});

