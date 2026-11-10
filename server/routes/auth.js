import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { one, query, tx } from '../db.js';
import { config } from '../config.js';
import { sendEmail } from '../mailer.js';
import { fail, requireAuth } from '../middleware.js';
import { validate } from '../validate.js';
import { profileStatus } from './profiles.js';

const router = Router();

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

async function issueToken(userId, kind, minutes) {
  const token = crypto.randomBytes(32).toString('hex');
  await query("UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND kind = $2 AND used_at IS NULL", [userId, kind]);
  await query(
    `INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [userId, kind, hashToken(token), String(minutes)]
  );
  return token;
}

async function useToken(token, kind) {
  if (!token || typeof token !== 'string') fail(400, 'This link is not valid.');
  const row = await one(
    `UPDATE auth_tokens SET used_at = now()
      WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [hashToken(token), kind]
  );
  if (!row) fail(400, 'This link is not valid or has expired. Please request a new one.');
  return row.user_id;
}

