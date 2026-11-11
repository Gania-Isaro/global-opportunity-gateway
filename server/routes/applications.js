import { Router } from 'express';
import { one, many, query, tx } from '../db.js';
import { fail, requireAuth, requireVerified } from '../middleware.js';
import { validate, idParam } from '../validate.js';
import { notify } from '../notify.js';
import { autoCloseChallenges } from './challenges.js';

const router = Router();

async function ownedChallenge(id, user) {
  const c = await one('SELECT * FROM challenges WHERE id = $1', [id]);
  if (!c) fail(404, 'Challenge not found.');
  if (c.owner_id !== user.id) fail(403, 'Only the challenge owner can do that.'); // BR 2
  return c;
}

async function applicationForOwner(appId, user) {
  const a = await one(
    `SELECT a.*, c.owner_id, c.title AS challenge_title, c.id AS challenge_id
       FROM applications a JOIN challenges c ON c.id = a.challenge_id WHERE a.id = $1`,
    [appId]
  );
  if (!a) fail(404, 'Application not found.');
  if (a.owner_id !== user.id) fail(403, 'Only the challenge owner can do that.');
  return a;
}

