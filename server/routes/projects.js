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

