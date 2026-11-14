import express from 'express';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool, initSchema } from './db.js';
import { loadUser, csrfGuard, errorHandler, HttpError } from './middleware.js';
import { emailEnabled } from './mailer.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import organisationRoutes from './routes/organisations.js';
import challengeRoutes, { autoCloseChallenges } from './routes/challenges.js';
import applicationRoutes from './routes/applications.js';
import projectRoutes from './routes/projects.js';
import notificationRoutes from './routes/notifications.js';
import dashboardRoutes from './routes/dashboard.js';
import adminRoutes from './routes/admin.js';
import reportRoutes from './routes/reports.js';
import { seedDemoData } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1); // HTTPS is terminated by the hosting proxy
app.disable('x-powered-by');

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (config.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

