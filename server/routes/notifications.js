import { Router } from 'express';
import { many, query, one } from '../db.js';
import { requireAuth } from '../middleware.js';
import { idParam } from '../validate.js';

const router = Router();

// FR 10.1 In-app notifications
router.get('/notifications', requireAuth, async (req, res) => {
  const rows = await many(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
    [req.user.id]
  );
  const unread = await one('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND NOT read', [req.user.id]);
  res.json({ notifications: rows, unread: unread.n });
});

// FR 10.3 Mark as read
router.post('/notifications/:id/read', requireAuth, async (req, res) => {
  await query('UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2', [idParam(req.params.id), req.user.id]);
  res.json({ message: 'Marked as read.' });
});

router.post('/notifications/read-all', requireAuth, async (req, res) => {
  await query('UPDATE notifications SET read = TRUE WHERE user_id = $1', [req.user.id]);
  res.json({ message: 'All notifications marked as read.' });
});

export default router;
