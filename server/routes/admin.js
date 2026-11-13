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

// FR 3.3 Organisation verification
router.get('/admin/organisations', ...admin, async (req, res) => {
  const status = ['pending', 'verified', 'rejected'].includes(req.query.status) ? req.query.status : null;
  const rows = await many(
    `SELECT o.*, p.full_name AS rep_name, u.email AS rep_email,
            COALESCE(json_agg(json_build_object('id', d.id, 'filename', d.filename, 'size', d.size))
                     FILTER (WHERE d.id IS NOT NULL), '[]') AS documents
       FROM organisations o
       JOIN users u ON u.id = o.rep_user_id
       JOIN profiles p ON p.user_id = o.rep_user_id
       LEFT JOIN organisation_documents d ON d.org_id = o.id
      ${status ? 'WHERE o.status = $1' : ''}
      GROUP BY o.id, p.full_name, u.email
      ORDER BY (o.status = 'pending') DESC, o.created_at DESC`,
    status ? [status] : []
  );
  res.json({ organisations: rows });
});

router.post('/admin/organisations/:id/decision', ...admin, async (req, res) => {
  const org = await one('SELECT * FROM organisations WHERE id = $1', [idParam(req.params.id)]);
  if (!org) fail(404, 'Organisation not found.');
  const d = validate(req.body, {
    decision: { required: true, type: 'enum', values: ['verified', 'rejected'], label: 'Decision' },
    reason: { max: 500 },
  });
  if (d.decision === 'rejected' && !d.reason) {
    fail(400, 'Please fix the highlighted fields.', { reason: 'Give a reason so the organisation knows what to fix.' });
  }
  await query(
    'UPDATE organisations SET status = $2, rejection_reason = $3, reviewed_at = now() WHERE id = $1',
    [org.id, d.decision, d.decision === 'rejected' ? d.reason : null]
  );
  await audit(req.user.id, d.decision === 'verified' ? 'verify_organisation' : 'reject_organisation', 'organisation', org.id,
    d.decision === 'rejected' ? `${org.name}: ${d.reason}` : org.name);
  // FR 3.5 Notify the representative
  await notify(
    org.rep_user_id,
    'verification_decision',
    d.decision === 'verified'
      ? `${org.name} is now verified. Your challenges will show the Verified badge.`
      : `${org.name} was not verified. Reason: ${d.reason}`,
    '/organisation'
  );
  res.json({ message: d.decision === 'verified' ? 'Organisation verified.' : 'Organisation rejected.' });
});

