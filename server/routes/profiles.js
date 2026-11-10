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

// FR 2.3 / BR 8 Restricted profile visibility.
// The full profile is shown only to the user, an admin, or the owner of a
// challenge the user has applied to. Everyone else sees name and skills.
router.get('/users/:id', requireAuth, async (req, res) => {
  const id = idParam(req.params.id);
  const p = await one(
    `SELECT p.*, u.role, u.created_at AS member_since, o.name AS org_name, o.status AS org_status
       FROM profiles p JOIN users u ON u.id = p.user_id
       LEFT JOIN organisations o ON o.rep_user_id = u.id
      WHERE p.user_id = $1`,
    [id]
  );
  if (!p) fail(404, 'User not found.');

  let full = req.user.id === id || req.user.role === 'admin';
  if (!full) {
    const link = await one(
      `SELECT 1 FROM applications a JOIN challenges c ON c.id = a.challenge_id
        WHERE a.participant_id = $1 AND c.owner_id = $2 LIMIT 1`,
      [id, req.user.id]
    );
    const teammate = await one(
      `SELECT 1 FROM project_members a JOIN project_members b ON a.project_id = b.project_id
        WHERE a.user_id = $1 AND b.user_id = $2 LIMIT 1`,
      [id, req.user.id]
    );
    full = Boolean(link || teammate);
  }

  if (full) return res.json({ profile: p, restricted: false });
  res.json({
    profile: {
      user_id: p.user_id,
      full_name: p.full_name,
      skills: p.skills,
      role: p.role,
      org_name: p.org_status === 'verified' ? p.org_name : null,
      org_status: p.org_status,
    },
    restricted: true,
  });
});

export default router;
