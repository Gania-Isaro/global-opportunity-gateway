import { Router } from 'express';
import { one, many } from '../db.js';
import { fail, requireAuth } from '../middleware.js';
import { validate } from '../validate.js';
import { notify } from '../notify.js';

const router = Router();

// FR 12.3 Any signed in user can report a challenge or an account.
router.post('/reports', requireAuth, async (req, res) => {
  const d = validate(req.body, {
    target_type: { required: true, type: 'enum', values: ['challenge', 'user'], label: 'Type' },
    target_id: { required: true, type: 'int', min: 1, max: 1e9 },
    reason: { required: true, label: 'Reason', max: 1000 },
  });
  const table = d.target_type === 'challenge' ? 'challenges' : 'users';
  const target = await one(`SELECT id FROM ${table} WHERE id = $1`, [d.target_id]);
  if (!target) fail(404, 'The item you are reporting no longer exists.');
  if (d.target_type === 'user' && d.target_id === req.user.id) fail(400, 'You cannot report yourself.');
  await one(
    'INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES ($1,$2,$3,$4) RETURNING id',
    [req.user.id, d.target_type, d.target_id, d.reason]
  );
  const admins = await many("SELECT id FROM users WHERE role = 'admin'");
  for (const a of admins) await notify(a.id, 'new_report', `A ${d.target_type} was reported for review.`, '/admin/reports');
  res.status(201).json({ message: 'Thank you. An administrator will review your report.' });
});

export default router;
