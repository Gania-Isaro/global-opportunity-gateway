import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  isProduction,
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://gog:gog@localhost:5432/gog',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  // In demo mode the confirmation and reset links are also shown on screen,
  // so the prototype can be tested without a real mailbox.
  demoMode: process.env.DEMO_MODE !== 'false',
  seedOnStart: process.env.SEED_DEMO_DATA === 'true',
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || 'GOG <no-reply@gog.local>',
  },
  sessionMinutes: 30, // NFR 5
  maxFailedLogins: 5, // Section 5.3
  lockMinutes: 15,
  maxFileBytes: 10 * 1024 * 1024, // FR 9.5
};
