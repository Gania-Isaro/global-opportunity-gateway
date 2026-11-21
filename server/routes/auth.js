import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { one, query, tx } from '../db.js';
import { config } from '../config.js';
import { emailEnabled, sendEmail } from '../mailer.js';
import { fail, requireAuth } from '../middleware.js';
import { validate } from '../validate.js';
import { profileStatus } from './profiles.js';

const router = Router();

// On-screen links exist only for demos without a mail server.
const showLink = (link) => (config.demoMode && !emailEnabled ? link : undefined);

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
  const delivered = await sendEmail(
    user.email,
    'Confirm your GOG account',
    `Welcome to GOG.\n\nPlease confirm your email address by opening this link:\n${link}\n\nThe link is valid for 24 hours.`
  );
  return { link, delivered };
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
  const { link, delivered } = await sendConfirmation(user);
  req.session.pendingConfirmUserId = user.id;
  res.status(201).json({
    message: emailEnabled && !delivered
      ? 'Account created, but the confirmation email could not be sent. Try "Resend" on the log in page in a few minutes.'
      : 'Account created. Check your email for a confirmation link.',
    demoLink: showLink(link),
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
  if (user && !user.email_verified) ({ link } = await sendConfirmation(user));
  res.json({
    message: 'If that account exists and is not confirmed yet, a new link has been sent.',
    demoLink: user && req.session.pendingConfirmUserId === user.id ? showLink(link) : undefined,
  });
});

// FR 1.3 Log in
router.post('/login', async (req, res) => {
  const { email, password } = validate(req.body, {
    email: { required: true, type: 'email' },
    password: { required: true },
  });
  const user = await one('SELECT * FROM users WHERE email = $1', [email]);
  const generic = 'Email or password is incorrect.';
  if (!user) fail(401, generic);
  if (user.banned) fail(403, 'This account has been suspended. Contact the GOG team for help.');
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    fail(423, `Too many failed attempts. This account is locked for ${config.lockMinutes} minutes.`);
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    // Shared demo logins must not be lockable by strangers.
    if (config.protectDemo && user.is_demo) fail(401, generic);
    const failed = user.failed_logins + 1;
    if (failed >= config.maxFailedLogins) {
      await query(
        `UPDATE users SET failed_logins = 0, locked_until = now() + ($2 || ' minutes')::interval WHERE id = $1`,
        [user.id, String(config.lockMinutes)]
      );
      fail(423, `Too many failed attempts. This account is locked for ${config.lockMinutes} minutes.`);
    }
    await query('UPDATE users SET failed_logins = $2 WHERE id = $1', [user.id, failed]);
    fail(401, generic);
  }
  if (!user.email_verified) {
    fail(403, 'Please confirm your email address before logging in. Check your inbox for the link.');
  }

  await query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
  await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  req.session.userId = user.id;
  res.json({ user: await currentUserPayload(user.id) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('gog.sid');
    res.json({ message: 'You have been logged out.' });
  });
});

router.get('/me', async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: await currentUserPayload(req.user.id) });
});

// FR 1.4 Reset password
router.post('/forgot', async (req, res) => {
  const { email } = validate(req.body, { email: { required: true, type: 'email' } });
  const user = await one('SELECT id, email, is_demo FROM users WHERE email = $1', [email]);
  if (user && !(config.protectDemo && user.is_demo)) {
    const token = await issueToken(user.id, 'reset', 30);
    const link = `${config.appUrl}/reset-password?token=${token}`;
    await sendEmail(
      user.email,
      'Reset your GOG password',
      `Someone asked to reset the password for this account.\n\nOpen this link to choose a new password:\n${link}\n\nThe link expires in 30 minutes. If you did not ask for this, you can ignore this email.`
    );
  }
  res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
});

router.post('/reset', async (req, res) => {
  const { password } = validate(req.body, { password: { required: true, type: 'password' } });
  const userId = await useToken(req.body?.token, 'reset');
  const hash = await bcrypt.hash(password, 12);
  await tx(async (c) => {
    await c.query(
      'UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1',
      [userId, hash]
    );
    // Section 5.3: a stolen session stops working once the password changes.
    await c.query("DELETE FROM user_sessions WHERE (sess->>'userId')::int = $1", [userId]);
  });
  res.json({ message: 'Your password has been changed. You can now log in.' });
});

// NFR 15 Delete my account. The audit log keeps a record without personal data.
router.post('/delete-account', requireAuth, async (req, res) => {
  const { password } = validate(req.body, { password: { required: true, label: 'Password' } });
  if (req.user.role === 'admin') fail(403, 'Administrator accounts cannot be deleted here.');
  if (config.protectDemo && req.user.is_demo) fail(403, 'Demo accounts cannot be deleted on the public site.');
  const account = await one('SELECT email, password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(password, account.password_hash))) {
    fail(400, 'Please fix the highlighted fields.', { password: 'That password is not correct.' });
  }
  const active = await one("SELECT count(*)::int AS n FROM projects WHERE owner_id = $1 AND status = 'active'", [req.user.id]);
  if (active.n) fail(409, 'You own an active project. Complete it before deleting your account so your team keeps its work.');

  await tx(async (c) => {
    await c.query(
      `INSERT INTO notifications (user_id, type, message)
       SELECT a.participant_id, 'challenge_removed',
              'The challenge "' || ch.title || '" is no longer available because its owner deleted their account.'
         FROM applications a JOIN challenges ch ON ch.id = a.challenge_id
        WHERE ch.owner_id = $1 AND a.status NOT IN ('withdrawn', 'rejected')`,
      [req.user.id]
    );
    await c.query(
      'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES (NULL, $1, $2, $3, $4)',
      ['delete_account', 'user', req.user.id, 'The user deleted their own account.']
    );
    // NFR 15: earlier audit entries keep the action but lose personal data.
    await c.query(
      `UPDATE audit_log SET details = NULL WHERE target_type = 'user' AND target_id = $1
         AND action IN ('suspend_user', 'unlock_user')`,
      [req.user.id]
    );
    await c.query(
      `UPDATE audit_log SET details = replace(details, $1, '[deleted user]') WHERE strpos(details, $1) > 0`,
      [account.email]
    );
    await c.query('DELETE FROM email_outbox WHERE to_email = $1', [account.email]);
    await c.query('DELETE FROM users WHERE id = $1', [req.user.id]);
  });
  req.session.destroy(() => {
    res.clearCookie('gog.sid');
    res.json({ message: 'Your account has been deleted.' });
  });
});

router.get('/session', requireAuth, (req, res) => {
  res.json({ expiresAt: req.session.cookie.expires });
});

export default router;
