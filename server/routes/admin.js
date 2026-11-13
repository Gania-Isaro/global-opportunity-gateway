import { Router } from 'express';
import { one, many, query } from '../db.js';
import { fail, requireAuth, requireRole } from '../middleware.js';
import { validate, idParam } from '../validate.js';
import { notify, audit } from '../notify.js';

const router = Router();
const admin = [requireAuth, requireRole('admin')];

export async function adminSummary() {
  const counts = await one(
    `SELECT (SELECT count(*) FROM users WHERE role <> 'admin')::int AS users,
            (SELECT count(*) FROM users WHERE banned)::int AS banned_users,
            (SELECT count(*) FROM challenges WHERE status = 'published')::int AS published_challenges,
            (SELECT count(*) FROM challenges WHERE status <> 'removed')::int AS challenges,
            (SELECT count(*) FROM projects)::int AS projects,
            (SELECT count(*) FROM projects WHERE status = 'active')::int AS active_projects,
            (SELECT count(*) FROM applications)::int AS applications,
            (SELECT count(*) FROM organisations WHERE status = 'pending')::int AS pending_organisations,
            (SELECT count(*) FROM reports WHERE status = 'open')::int AS open_reports`
  );
  const pending = await many(
    `SELECT o.id, o.name, o.sector, o.created_at, p.full_name AS rep_name
       FROM organisations o JOIN profiles p ON p.user_id = o.rep_user_id
      WHERE o.status = 'pending' ORDER BY o.created_at ASC`
  );
  return { counts, pending };
}

// FR 11.3 Administrator dashboard
router.get('/admin/summary', ...admin, async (req, res) => {
  res.json(await adminSummary());
});

