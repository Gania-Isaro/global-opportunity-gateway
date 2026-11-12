import { Router } from 'express';
import { one, many, query } from '../db.js';
import { fail, requireAuth } from '../middleware.js';
import { validate, idParam } from '../validate.js';
import { acceptFiles } from '../uploads.js';
import { notify } from '../notify.js';

const router = Router();

// FR 9.1 / NFR 4 / BR 7: every workspace request checks that the user is a
// member, the project owner or an administrator. This runs on the server for
// every request, not only in the interface (NFR 3).
async function workspaceAccess(req, res, next) {
  const projectId = idParam(req.params.projectId);
  const project = await one(
    `SELECT p.*, c.title AS challenge_title FROM projects p
       JOIN challenges c ON c.id = p.challenge_id WHERE p.id = $1`,
    [projectId]
  );
  if (!project) fail(404, 'Project not found.');
  const member = await one('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, req.user.id]);
  const isOwner = project.owner_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!member && !isOwner && !isAdmin) {
    fail(403, 'This workspace is private to its team.');
  }
  req.project = project;
  req.access = { isOwner, isAdmin, isMember: Boolean(member), canManage: isOwner || isAdmin };
  next();
}

const ws = [requireAuth, workspaceAccess];

function requireManager(req) {
  if (!req.access.canManage) fail(403, 'Only the project owner can do that.');
}

// FR 9.8 Progress = completed tasks and milestones / all tasks and milestones
export async function projectProgress(projectId) {
  const r = await one(
    `SELECT (SELECT count(*) FROM tasks WHERE project_id = $1)::int AS tasks_total,
            (SELECT count(*) FROM tasks WHERE project_id = $1 AND status = 'done')::int AS tasks_done,
            (SELECT count(*) FROM milestones WHERE project_id = $1)::int AS milestones_total,
            (SELECT count(*) FROM milestones WHERE project_id = $1 AND done)::int AS milestones_done`,
    [projectId]
  );
  const total = r.tasks_total + r.milestones_total;
  const done = r.tasks_done + r.milestones_done;
  return { ...r, percent: total ? Math.round((done / total) * 100) : 0 };
}

async function memberIds(projectId) {
  const rows = await many('SELECT user_id FROM project_members WHERE project_id = $1', [projectId]);
  return rows.map((r) => r.user_id);
}

router.get('/projects/mine', requireAuth, async (req, res) => {
  const rows = await many(
    `SELECT p.id, p.name, p.status, p.created_at, c.title AS challenge_title, pm.role,
            (p.owner_id = $1) AS is_owner
       FROM projects p
       JOIN challenges c ON c.id = p.challenge_id
       JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
      ORDER BY p.created_at DESC`,
    [req.user.id]
  );
  for (const r of rows) r.progress = (await projectProgress(r.id)).percent;
  res.json({ projects: rows });
});

// FR 9.2 Overview
router.get('/projects/:projectId', ...ws, async (req, res) => {
  const p = req.project;
  const challenge = await one(
    `SELECT c.id, c.title, c.description, c.outcome, c.sector, c.skills, c.deadline, c.team_size,
            o.name AS org_name, (o.status = 'verified') AS verified
       FROM challenges c LEFT JOIN organisations o ON o.id = c.org_id WHERE c.id = $1`,
    [p.challenge_id]
  );
  const members = await many(
    `SELECT pm.user_id, pm.role, pm.joined_at, pr.full_name, pr.skills, (pm.user_id = $2) AS is_owner
       FROM project_members pm JOIN profiles pr ON pr.user_id = pm.user_id
      WHERE pm.project_id = $1 ORDER BY (pm.user_id = $2) DESC, pm.joined_at`,
    [p.id, p.owner_id]
  );
  // Confirmed participants who are not yet in the team, so the owner can add them.
  const available = req.access.canManage ? await many(
    `SELECT a.participant_id AS user_id, pr.full_name
       FROM applications a JOIN invitations i ON i.application_id = a.id
       JOIN profiles pr ON pr.user_id = a.participant_id
      WHERE a.challenge_id = $1 AND i.status = 'confirmed'
        AND a.participant_id NOT IN (SELECT user_id FROM project_members WHERE project_id = $2)`,
    [p.challenge_id, p.id]
  ) : [];
  res.json({
    project: { id: p.id, name: p.name, status: p.status, created_at: p.created_at, owner_id: p.owner_id },
    challenge,
    members,
    available,
    progress: await projectProgress(p.id),
    access: req.access,
  });
});

router.post('/projects/:projectId/complete', ...ws, async (req, res) => {
  requireManager(req);
  const status = req.project.status === 'active' ? 'completed' : 'active';
  await query('UPDATE projects SET status = $2, completed_at = $3 WHERE id = $1',
    [req.project.id, status, status === 'completed' ? new Date() : null]);
  res.json({ message: status === 'completed' ? 'Project marked as completed.' : 'Project reopened.' });
});

// Add a confirmed participant to an existing team
router.post('/projects/:projectId/members', ...ws, async (req, res) => {
  requireManager(req);
  const { user_id } = validate(req.body, { user_id: { required: true, type: 'int', min: 1, max: 1e9 } });
  const ok = await one(
    `SELECT 1 FROM applications a JOIN invitations i ON i.application_id = a.id
      WHERE a.challenge_id = $1 AND a.participant_id = $2 AND i.status = 'confirmed'`,
    [req.project.challenge_id, user_id]
  );
  if (!ok) fail(400, 'Only participants who confirmed their invitation can join the team.');
  await query("INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.project.id, user_id]);
  await notify(user_id, 'team_formed', `You were added to the team "${req.project.name}".`, `/projects/${req.project.id}`);
  res.json({ message: 'Member added to the team.' });
});

// FR 8.3 Assign roles
router.put('/projects/:projectId/members/:userId', ...ws, async (req, res) => {
  requireManager(req);
  const userId = idParam(req.params.userId);
  const { role } = validate(req.body, { role: { required: true, label: 'Role', max: 60 } });
  const r = await query('UPDATE project_members SET role = $3 WHERE project_id = $1 AND user_id = $2', [req.project.id, userId, role]);
  if (!r.rowCount) fail(404, 'Member not found.');
  res.json({ message: 'Role updated.' });
});

