// Shared helpers for the database backup and restore commands (NFR 16).
import crypto from 'node:crypto';
import path from 'node:path';

const MAGIC = Buffer.from('GOGB1');

export const pgTool = (name) => (process.env.PG_BIN ? path.join(process.env.PG_BIN, name) : name);

// Passes the connection through the environment so the password never
// appears in the process list.
export function pgEnv(databaseUrl) {
  const u = new URL(databaseUrl);
  const env = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.slice(1),
  };
  const sslmode = u.searchParams.get('sslmode');
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

const keyFrom = (passphrase, salt) => crypto.scryptSync(passphrase, salt, 32);

export function encrypt(data, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function decrypt(data, passphrase) {
  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('This is not an encrypted GOG backup.');
  let at = MAGIC.length;
  const salt = data.subarray(at, (at += 16));
  const iv = data.subarray(at, (at += 12));
  const tag = data.subarray(at, (at += 16));
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFrom(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data.subarray(at)), decipher.final()]);
}
