// Demo data for the GOG prototype.
// Run with: npm run seed           (adds data only if the database is empty)
//           npm run seed -- --reset (wipes everything and seeds again)
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { pool, one, initSchema, tx } from './db.js';

export const DEMO_PASSWORD = 'Demo1234';

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

