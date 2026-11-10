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

// FR 1.1 Register
router.post('/register', async (req, res) => {
  const data = validate(req.body, {
    fullName: { required: true, label: 'Full name', max: 120 },
    email: { required: true, type: 'email' },
    password: { required: true, type: 'password' },
    role: { required: true, type: 'enum', values: ['participant', 'owner'], label: 'Account type' },
  });
  const exists = await one('SELECT id FROM users WHERE email = $1', [data.email]);
  if (exists) fail(400, 'Please fix the highlighted fields.', { email: 'An account with this email already exists.' });

  const hash = await bcrypt.hash(data.password, 12); // NFR 2
  const user = await tx(async (c) => {
    const { rows } = await c.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email',
      [data.email, hash, data.role]
    );
    await c.query('INSERT INTO profiles (user_id, full_name) VALUES ($1, $2)', [rows[0].id, data.fullName]);
    return rows[0];
  });
  const link = await sendConfirmation(user);
  res.status(201).json({
    message: 'Account created. Check your email for a confirmation link.',
    demoLink: config.demoMode ? link : undefined,
  });
});

// FR 1.2 Confirm email
router.post('/confirm', async (req, res) => {
  const userId = await useToken(req.body?.token, 'confirm');
  await query('UPDATE users SET email_verified = TRUE WHERE id = $1', [userId]);
  res.json({ message: 'Your email is confirmed. You can now log in.' });
});

router.post('/resend-confirmation', async (req, res) => {
  const { email } = validate(req.body, { email: { required: true, type: 'email' } });
  const user = await one('SELECT id, email, email_verified FROM users WHERE email = $1', [email]);
  let link;
  if (user && !user.email_verified) link = await sendConfirmation(user);
  res.json({
    message: 'If that account exists and is not confirmed yet, a new link has been sent.',
    demoLink: config.demoMode ? link : undefined,
  });
});

