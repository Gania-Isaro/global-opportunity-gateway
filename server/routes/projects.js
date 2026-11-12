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

