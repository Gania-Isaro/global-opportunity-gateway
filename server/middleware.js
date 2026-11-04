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

export function requireVerified(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Please log in to continue.'));
  if (!req.user.email_verified) {
    return next(new HttpError(403, 'Please confirm your email address first.'));
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Please log in to continue.'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have permission to do that.'));
    }
    next();
  };
}

// CSRF protection: state changing requests must carry a custom header.
// Browsers do not allow other sites to set it without a CORS preflight,
// which this server never approves.
export function csrfGuard(req, res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (safe || req.get('X-Requested-With') === 'GOG') return next();
  next(new HttpError(403, 'Request blocked by CSRF protection.'));
}

export function errorHandler(err, req, res, next) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File is too large. The maximum size is 10 MB.' });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, fields: err.fields });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}
