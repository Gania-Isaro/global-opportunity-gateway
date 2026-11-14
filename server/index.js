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

// Redirect plain HTTP to HTTPS in production (Section 3.4)
app.use((req, res, next) => {
  if (config.isProduction && req.get('x-forwarded-proto') === 'http') {
    return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
  }
  next();
});

app.use(express.json({ limit: '200kb' }));

const PgStore = connectPg(session);
app.use(
  session({
    name: 'gog.sid',
    store: new PgStore({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // every request resets the 30 minute idle timer (NFR 5)
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: config.sessionMinutes * 60 * 1000,
    },
  })
);

const api = express.Router();
api.use(csrfGuard);
api.use(loadUser);
api.get('/health', (req, res) => res.json({ ok: true, email: emailEnabled ? 'smtp' : 'log', demoMode: config.demoMode }));
api.use('/auth', authRoutes);
api.use(profileRoutes);
api.use(organisationRoutes);
api.use(challengeRoutes);
api.use(applicationRoutes);
api.use(projectRoutes);
api.use(notificationRoutes);
api.use(dashboardRoutes);
api.use(adminRoutes);
api.use(reportRoutes);
api.use((req, res, next) => next(new HttpError(404, 'Not found.')));
app.use('/api', api);

// Serve the built React app in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

async function start() {
  await initSchema();
  if (config.seedOnStart) await seedDemoData({ onlyIfEmpty: true });
  await autoCloseChallenges();
  setInterval(() => autoCloseChallenges().catch((e) => console.error(e)), 60 * 60 * 1000);
  app.listen(config.port, () => {
    console.log(`GOG server running on http://localhost:${config.port}`);
    if (!emailEnabled) console.log('No SMTP settings found. Emails will be printed here instead of sent.');
  });
}

start().catch((err) => {
  console.error('Failed to start the server:', err.message);
  process.exit(1);
});

export default app;
