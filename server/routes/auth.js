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

async function sendConfirmation(user) {
  const token = await issueToken(user.id, 'confirm', 60 * 24);
  const link = `${config.appUrl}/confirm-email?token=${token}`;
  await sendEmail(
    user.email,
    'Confirm your GOG account',
    `Welcome to GOG.\n\nPlease confirm your email address by opening this link:\n${link}\n\nThe link is valid for 24 hours.`
  );
  return link;
}

export async function currentUserPayload(userId) {
  const user = await one(
    `SELECT u.id, u.email, u.role, u.email_verified, p.full_name,
            o.id AS org_id, o.name AS org_name, o.status AS org_status
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN organisations o ON o.rep_user_id = u.id
      WHERE u.id = $1`,
    [userId]
  );
  if (!user) return null;
  const unread = await one('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND NOT read', [userId]);
  const status = await profileStatus(userId);
  return { ...user, unread_notifications: unread.n, profile_complete: status.complete };
}

