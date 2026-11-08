import { one } from './db.js';

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const fail = (status, message, fields) => {
  throw new HttpError(status, message, fields);
};

// Loads the signed in user on every request so bans and role changes
// take effect immediately (NFR 3).
export async function loadUser(req, res, next) {
  req.user = null;
  if (req.session?.userId) {
    const user = await one(
      `SELECT u.id, u.email, u.role, u.email_verified, u.banned, p.full_name
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1`,
      [req.session.userId]
    );
    if (!user || user.banned) {
      req.session.destroy(() => {});
    } else {
      req.user = user;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Please log in to continue.'));
  next();
}

