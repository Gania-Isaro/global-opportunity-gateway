// Restores a backup made by scripts/backup.js (NFR 16).
// Run with: npm run db:restore -- backups/<file> --yes
// This replaces the data in the target database.
// The target is RESTORE_DATABASE_URL, or DATABASE_URL when that is not set.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decrypt, pgEnv, pgTool } from './backup-lib.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const databaseUrl = process.env.RESTORE_DATABASE_URL || process.env.DATABASE_URL;

if (!file || !fs.existsSync(file)) {
  console.error('Usage: npm run db:restore -- backups/<file> --yes');
  process.exit(1);
}
if (!databaseUrl) {
  console.error('Set DATABASE_URL or RESTORE_DATABASE_URL first.');
  process.exit(1);
}
const target = new URL(databaseUrl);
if (!args.includes('--yes')) {
  console.error(`This replaces all data in "${target.pathname.slice(1)}" on ${target.hostname}. Add --yes to continue.`);
  process.exit(1);
}

let dumpFile = file;
let tempFile = null;
if (file.endsWith('.enc')) {
  if (!process.env.BACKUP_PASSPHRASE) {
    console.error('Set BACKUP_PASSPHRASE to restore an encrypted backup.');
    process.exit(1);
  }
  tempFile = path.join(os.tmpdir(), `gog-restore-${process.pid}.dump`);
  fs.writeFileSync(tempFile, decrypt(fs.readFileSync(file), process.env.BACKUP_PASSPHRASE), { mode: 0o600 });
  dumpFile = tempFile;
}

const env = pgEnv(databaseUrl);
const result = spawnSync(
  pgTool('pg_restore'),
  ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', `--dbname=${env.PGDATABASE}`, dumpFile],
  { env, stdio: ['ignore', 'inherit', 'inherit'] }
);
if (tempFile) fs.rmSync(tempFile, { force: true });
if (result.error || result.status !== 0) {
  console.error('Restore failed. No changes were kept.', result.error?.message || '');
  process.exit(1);
}
console.log('Restore complete.');
