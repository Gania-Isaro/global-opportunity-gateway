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

// FR 9.3 Tasks
router.get('/projects/:projectId/tasks', ...ws, async (req, res) => {
  const rows = await many(
    `SELECT t.*, pa.full_name AS assignee_name, pc.full_name AS creator_name
       FROM tasks t
       LEFT JOIN profiles pa ON pa.user_id = t.assignee_id
       LEFT JOIN profiles pc ON pc.user_id = t.created_by
      WHERE t.project_id = $1 ORDER BY t.status = 'done', t.due_date NULLS LAST, t.id`,
    [req.project.id]
  );
  res.json({ tasks: rows });
});

const taskRules = {
  title: { required: true, label: 'Task title', max: 200 },
  description: { max: 2000, default: '' },
  assignee_id: { type: 'int', min: 1, max: 1e9 },
  status: { type: 'enum', values: ['todo', 'in_progress', 'done'], default: 'todo' },
  due_date: { type: 'date', label: 'Due date' },
};

async function checkAssignee(projectId, assigneeId) {
  if (!assigneeId) return;
  const ok = await one('SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, assigneeId]);
  if (!ok) fail(400, 'Tasks can only be assigned to team members.');
}

router.post('/projects/:projectId/tasks', ...ws, async (req, res) => {
  const d = validate(req.body, taskRules);
  await checkAssignee(req.project.id, d.assignee_id);
  const t = await one(
    `INSERT INTO tasks (project_id, title, description, assignee_id, status, due_date, created_by, completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.project.id, d.title, d.description, d.assignee_id, d.status, d.due_date, req.user.id,
      d.status === 'done' ? new Date() : null]
  );
  if (d.assignee_id && d.assignee_id !== req.user.id) {
    await notify(d.assignee_id, 'task_assigned', `You were assigned the task "${d.title}" in ${req.project.name}.`, `/projects/${req.project.id}?tab=tasks`);
  }
  res.status(201).json({ task: t, message: 'Task created.' });
});

router.put('/projects/:projectId/tasks/:taskId', ...ws, async (req, res) => {
  const current = await one('SELECT * FROM tasks WHERE id = $1 AND project_id = $2', [idParam(req.params.taskId), req.project.id]);
  if (!current) fail(404, 'Task not found.');
  const d = validate({ ...current, ...req.body }, taskRules);
  await checkAssignee(req.project.id, d.assignee_id);
  const completedAt = d.status === 'done' ? current.completed_at || new Date() : null;
  const t = await one(
    `UPDATE tasks SET title=$2, description=$3, assignee_id=$4, status=$5, due_date=$6, completed_at=$7
      WHERE id=$1 RETURNING *`,
    [current.id, d.title, d.description, d.assignee_id, d.status, d.due_date, completedAt]
  );
  if (d.assignee_id && d.assignee_id !== current.assignee_id && d.assignee_id !== req.user.id) {
    await notify(d.assignee_id, 'task_assigned', `You were assigned the task "${d.title}" in ${req.project.name}.`, `/projects/${req.project.id}?tab=tasks`);
  }
  res.json({ task: t, message: 'Task updated.' });
});

router.delete('/projects/:projectId/tasks/:taskId', ...ws, async (req, res) => {
  const r = await query('DELETE FROM tasks WHERE id = $1 AND project_id = $2', [idParam(req.params.taskId), req.project.id]);
  if (!r.rowCount) fail(404, 'Task not found.');
  res.json({ message: 'Task deleted.' });
});

// FR 9.4 Research notes
router.get('/projects/:projectId/notes', ...ws, async (req, res) => {
  const rows = await many(
    `SELECT n.*, p.full_name AS author_name FROM research_notes n
       LEFT JOIN profiles p ON p.user_id = n.author_id
      WHERE n.project_id = $1 ORDER BY n.created_at DESC`,
    [req.project.id]
  );
  res.json({ notes: rows });
});

router.post('/projects/:projectId/notes', ...ws, async (req, res) => {
  const d = validate(req.body, {
    title: { required: true, label: 'Title', max: 200 },
    body: { max: 5000, default: '' },
    link: { type: 'url' },
  });
  const n = await one(
    'INSERT INTO research_notes (project_id, author_id, title, body, link) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.project.id, req.user.id, d.title, d.body, d.link]
  );
  res.status(201).json({ note: n, message: 'Research note saved.' });
});

router.delete('/projects/:projectId/notes/:noteId', ...ws, async (req, res) => {
  const n = await one('SELECT author_id FROM research_notes WHERE id = $1 AND project_id = $2', [idParam(req.params.noteId), req.project.id]);
  if (!n) fail(404, 'Note not found.');
  if (n.author_id !== req.user.id && !req.access.canManage) fail(403, 'Only the author or project owner can delete this note.');
  await query('DELETE FROM research_notes WHERE id = $1', [idParam(req.params.noteId)]);
  res.json({ message: 'Note deleted.' });
});

// FR 9.5 Files (10 MB limit, approved types only)
router.get('/projects/:projectId/files', ...ws, async (req, res) => {
  const rows = await many(
    `SELECT f.id, f.filename, f.mime, f.size, f.created_at, f.uploader_id, p.full_name AS uploader_name
       FROM project_files f LEFT JOIN profiles p ON p.user_id = f.uploader_id
      WHERE f.project_id = $1 ORDER BY f.created_at DESC`,
    [req.project.id]
  );
  res.json({ files: rows });
});

router.post('/projects/:projectId/files', ...ws, acceptFiles('file'), async (req, res) => {
  if (!req.file) fail(400, 'Choose a file to upload.');
  const f = await one(
    `INSERT INTO project_files (project_id, uploader_id, filename, mime, size, data)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, filename, size, created_at`,
    [req.project.id, req.user.id, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]
  );
  res.status(201).json({ file: f, message: 'File uploaded.' });
});

router.get('/projects/:projectId/files/:fileId', ...ws, async (req, res) => {
  const f = await one('SELECT filename, mime, data FROM project_files WHERE id = $1 AND project_id = $2', [idParam(req.params.fileId), req.project.id]);
  if (!f) fail(404, 'File not found.');
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(f.filename)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(f.data);
});

router.delete('/projects/:projectId/files/:fileId', ...ws, async (req, res) => {
  const f = await one('SELECT uploader_id FROM project_files WHERE id = $1 AND project_id = $2', [idParam(req.params.fileId), req.project.id]);
  if (!f) fail(404, 'File not found.');
  if (f.uploader_id !== req.user.id && !req.access.canManage) fail(403, 'Only the uploader or project owner can delete this file.');
  await query('DELETE FROM project_files WHERE id = $1', [idParam(req.params.fileId)]);
  res.json({ message: 'File deleted.' });
});

// FR 9.6 Discussions (posts and replies)
router.get('/projects/:projectId/posts', ...ws, async (req, res) => {
  const rows = await many(
    `SELECT d.*, p.full_name AS author_name FROM discussion_posts d
       LEFT JOIN profiles p ON p.user_id = d.author_id
      WHERE d.project_id = $1 ORDER BY d.created_at ASC`,
    [req.project.id]
  );
  res.json({ posts: rows });
});

router.post('/projects/:projectId/posts', ...ws, async (req, res) => {
  const d = validate(req.body, {
    body: { required: true, label: 'Message', max: 4000 },
    parent_id: { type: 'int', min: 1, max: 1e9 },
  });
  if (d.parent_id) {
    const parent = await one('SELECT id FROM discussion_posts WHERE id = $1 AND project_id = $2', [d.parent_id, req.project.id]);
    if (!parent) fail(400, 'The message you are replying to no longer exists.');
  }
  const post = await one(
    'INSERT INTO discussion_posts (project_id, author_id, parent_id, body) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.project.id, req.user.id, d.parent_id, d.body]
  );
  for (const uid of await memberIds(req.project.id)) {
    if (uid !== req.user.id) {
      await notify(uid, 'discussion_post', `${req.user.full_name} posted in ${req.project.name}.`, `/projects/${req.project.id}?tab=discussions`);
    }
  }
  res.status(201).json({ post, message: 'Message posted.' });
});

// FR 9.7 Milestones (set and checked off by the owner)
router.get('/projects/:projectId/milestones', ...ws, async (req, res) => {
  const rows = await many('SELECT * FROM milestones WHERE project_id = $1 ORDER BY due_date NULLS LAST, id', [req.project.id]);
  res.json({ milestones: rows });
});

router.post('/projects/:projectId/milestones', ...ws, async (req, res) => {
  requireManager(req);
  const d = validate(req.body, {
    title: { required: true, label: 'Milestone', max: 200 },
    due_date: { type: 'date', label: 'Due date' },
  });
  const m = await one('INSERT INTO milestones (project_id, title, due_date) VALUES ($1,$2,$3) RETURNING *', [req.project.id, d.title, d.due_date]);
  res.status(201).json({ milestone: m, message: 'Milestone added.' });
});

router.post('/projects/:projectId/milestones/:milestoneId/toggle', ...ws, async (req, res) => {
  requireManager(req);
  const m = await one(
    `UPDATE milestones SET done = NOT done, done_at = CASE WHEN done THEN NULL ELSE now() END
      WHERE id = $1 AND project_id = $2 RETURNING *`,
    [idParam(req.params.milestoneId), req.project.id]
  );
  if (!m) fail(404, 'Milestone not found.');
  res.json({ milestone: m, message: m.done ? 'Milestone completed.' : 'Milestone reopened.' });
});

router.delete('/projects/:projectId/milestones/:milestoneId', ...ws, async (req, res) => {
  requireManager(req);
  await query('DELETE FROM milestones WHERE id = $1 AND project_id = $2', [idParam(req.params.milestoneId), req.project.id]);
  res.json({ message: 'Milestone deleted.' });
});

export default router;
