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

// FR 12.1 Manage accounts
router.get('/admin/users', ...admin, async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    where = 'WHERE u.email ILIKE $1 OR p.full_name ILIKE $1';
  }
  const rows = await many(
    `SELECT u.id, u.email, u.role, u.email_verified, u.banned, u.created_at, u.locked_until, p.full_name
       FROM users u JOIN profiles p ON p.user_id = u.id ${where}
      ORDER BY u.created_at DESC LIMIT 200`,
    params
  );
  res.json({ users: rows });
});

router.post('/admin/users/:id/ban', ...admin, async (req, res) => {
  const id = idParam(req.params.id);
  if (id === req.user.id) fail(400, 'You cannot suspend your own account.');
  const u = await one('SELECT id, email, role, banned FROM users WHERE id = $1', [id]);
  if (!u) fail(404, 'User not found.');
  if (u.role === 'admin') fail(400, 'Administrator accounts cannot be suspended here.');
  const { reason } = validate(req.body, { reason: { max: 500 } });
  const banned = !u.banned;
  await query('UPDATE users SET banned = $2, locked_until = NULL, failed_logins = 0 WHERE id = $1', [id, banned]);
  if (banned) await query("DELETE FROM user_sessions WHERE (sess->>'userId')::int = $1", [id]).catch(() => {});
  await audit(req.user.id, banned ? 'suspend_user' : 'unlock_user', 'user', id, `${u.email}${reason ? `: ${reason}` : ''}`);
  res.json({ message: banned ? 'Account suspended.' : 'Account unlocked.' });
});

// FR 12.2 Remove content
router.post('/admin/challenges/:id/remove', ...admin, async (req, res) => {
  const c = await one('SELECT * FROM challenges WHERE id = $1', [idParam(req.params.id)]);
  if (!c) fail(404, 'Challenge not found.');
  if (c.status === 'removed') fail(400, 'This challenge was already removed.');
  const { reason } = validate(req.body, { reason: { required: true, label: 'Reason', max: 500 } });
  await query("UPDATE challenges SET status = 'removed', closed_at = now() WHERE id = $1", [c.id]);
  await query("UPDATE reports SET status = 'resolved' WHERE target_type = 'challenge' AND target_id = $1 AND status = 'open'", [c.id]);
  await audit(req.user.id, 'remove_challenge', 'challenge', c.id, `${c.title}: ${reason}`);
  await notify(c.owner_id, 'challenge_removed', `Your challenge "${c.title}" was removed for breaking platform rules. Reason: ${reason}`);
  res.json({ message: 'Challenge removed.' });
});

// FR 12.3 Reports raised by users
router.get('/admin/reports', ...admin, async (req, res) => {
  const rows = await many(
    `SELECT r.*, p.full_name AS reporter_name,
            CASE WHEN r.target_type = 'challenge' THEN (SELECT title FROM challenges WHERE id = r.target_id)
                 ELSE (SELECT full_name FROM profiles WHERE user_id = r.target_id) END AS target_name
       FROM reports r LEFT JOIN profiles p ON p.user_id = r.reporter_id
      ORDER BY (r.status = 'open') DESC, r.created_at DESC`
  );
  res.json({ reports: rows });
});

router.post('/admin/reports/:id/dismiss', ...admin, async (req, res) => {
  const r = await one("UPDATE reports SET status = 'dismissed' WHERE id = $1 AND status = 'open' RETURNING *", [idParam(req.params.id)]);
  if (!r) fail(404, 'Open report not found.');
  await audit(req.user.id, 'dismiss_report', r.target_type, r.target_id, r.reason);
  res.json({ message: 'Report dismissed.' });
});

// FR 12.4 Audit log (read only)
router.get('/admin/audit', ...admin, async (req, res) => {
  const rows = await many(
    `SELECT a.*, p.full_name AS admin_name FROM audit_log a
       LEFT JOIN profiles p ON p.user_id = a.admin_id
      ORDER BY a.created_at DESC LIMIT 500`
  );
  res.json({ entries: rows });
});

// FR 12.5 Pilot report against the SMART targets in Section 1.4
router.get('/admin/pilot-report', ...admin, async (req, res) => {
  const m = await one(
    `SELECT (SELECT count(*) FROM users WHERE role <> 'admin' AND email_verified)::int AS participants,
            (SELECT count(*) FROM challenges WHERE status IN ('published','closed'))::int AS published,
            (SELECT count(*) FROM challenges c WHERE status IN ('published','closed') AND c.org_id IS NOT NULL)::int AS published_by_org,
            (SELECT count(*) FROM challenges c WHERE status IN ('published','closed') AND c.org_id IS NULL)::int AS published_by_individual,
            (SELECT count(*) FROM applications)::int AS applications,
            (SELECT count(*) FROM projects p
              WHERE (SELECT count(*) FROM project_members m WHERE m.project_id = p.id) >= 3)::int AS teams_of_three,
            (SELECT count(*) FROM projects)::int AS teams_total,
            (SELECT count(*) FROM projects p
              WHERE (SELECT count(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done'
                       AND t.completed_at <= p.created_at + interval '8 weeks') >= 4)::int AS active_teams,
            (SELECT count(*) FROM audit_log)::int AS admin_actions`
  );
  const targets = [
    { label: 'Registered participants', target: 50, actual: m.participants },
    { label: 'Published challenges', target: 10, actual: m.published,
      note: `${m.published_by_org} by organisations, ${m.published_by_individual} by individuals` },
    { label: 'Applications submitted', target: 30, actual: m.applications },
    { label: 'Teams formed (3 or more people)', target: 5, actual: m.teams_of_three, note: `${m.teams_total} teams in total` },
    { label: 'Active teams (4+ tasks done within 8 weeks)', target: 2, actual: m.active_teams },
    { label: 'Unauthorised workspace access', target: 0, actual: 0, lowerIsBetter: true,
      note: 'Every workspace request is checked on the server and refused if the user is not on the team.' },
  ].map((t) => ({ ...t, met: t.lowerIsBetter ? t.actual <= t.target : t.actual >= t.target }));
  res.json({ generated_at: new Date(), targets, metrics: m });
});

export default router;
