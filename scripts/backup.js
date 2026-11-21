// Creates a database backup in backups/ and keeps the newest 14 (NFR 16).
// Run with: npm run db:backup
// Set BACKUP_PASSPHRASE to encrypt the file.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { encrypt, pgEnv, pgTool } from './backup-lib.js';

const KEEP = 14;
const databaseUrl = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Set DATABASE_URL or BACKUP_DATABASE_URL first.');
  process.exit(1);
}

const dir = path.resolve(process.env.BACKUP_DIR || 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dumpFile = path.join(dir, `gog-${stamp}.dump`);

const result = spawnSync(pgTool('pg_dump'), ['--format=custom', '--no-owner', '--no-privileges', `--file=${dumpFile}`], {
  env: pgEnv(databaseUrl),
  stdio: ['ignore', 'inherit', 'inherit'],
});
if (result.error || result.status !== 0) {
  fs.rmSync(dumpFile, { force: true });
  console.error('Backup failed.', result.error?.message || '');
  process.exit(1);
}

let finalFile = dumpFile;
if (process.env.BACKUP_PASSPHRASE) {
  finalFile = `${dumpFile}.enc`;
  fs.writeFileSync(finalFile, encrypt(fs.readFileSync(dumpFile), process.env.BACKUP_PASSPHRASE));
  fs.rmSync(dumpFile);
}

const old = fs.readdirSync(dir).filter((f) => /^gog-.*\.dump(\.enc)?$/.test(f)).sort().reverse().slice(KEEP);
for (const f of old) fs.rmSync(path.join(dir, f));

console.log(`Backup saved: ${finalFile}`);
