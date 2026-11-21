// End to end tests for the remaining functional and business rules.
// Start the server with DEMO_MODE=true and PROTECT_DEMO=false first, then run: npm test
import 'dotenv/config';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const BASE = process.env.BASE_URL || 'http://localhost:4000';
const stamp = `${Date.now()}rules`;
const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://gog:gog@localhost:5432/gog',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
after(() => db.end());

function client() {
  let cookie = '';
  const call = async (method, path, body) => {
    const headers = { 'X-Requested-With': 'GOG' };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + '/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };
  return { get: (p) => call('GET', p), post: (p, b = {}) => call('POST', p, b), put: (p, b = {}) => call('PUT', p, b) };
}

async function signUp(c, name, role) {
  const email = `${name.toLowerCase()}.${stamp}@test.rw`;
  const reg = await c.post('/auth/register', { fullName: name, email, password: 'Passw0rd!', role });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const token = new URL(reg.data.demoLink).searchParams.get('token');
  assert.equal((await c.post('/auth/confirm', { token })).status, 200);
  const login = await c.post('/auth/login', { email, password: 'Passw0rd!' });
  assert.equal(login.status, 200);
  const profile = await c.put('/profile', {
    full_name: name, bio: 'Bio', skills: ['Research'], location: 'Kigali', experiences: 'Exchange in Ghana',
  });
  assert.equal(profile.status, 200);
  return { email, id: login.data.user.id };
}

async function publish(owner, title) {
  const r = await owner.post('/challenges', {
    title: `${title} ${stamp}`, description: 'A test problem.', sector: 'Health',
    skills: ['Research'], outcome: 'A result.', deadline: '2099-12-31', team_size: 2,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal((await owner.post(`/challenges/${r.data.challenge.id}/publish`)).status, 200);
  return r.data.challenge.id;
}

const motivation = { motivation: 'I studied this problem abroad and can help.' };
const owner = client();
const member = client();
const other = client();
const admin = client();
const ctx = {};

test('setup: accounts for the rule tests', async () => {
  ctx.owner = await signUp(owner, 'RuleOwner', 'owner');
  ctx.member = await signUp(member, 'RuleMember', 'participant');
  ctx.other = await signUp(other, 'RuleOther', 'participant');
  assert.equal((await admin.post('/auth/login', { email: 'admin@gog.rw', password: 'Demo1234' })).status, 200);
});

test('FR 1.4: password reset by email, with single use links and no link on screen', async () => {
  const c = client();
  const forgot = await c.post('/auth/forgot', { email: ctx.other.email });
  assert.equal(forgot.status, 200);
  assert.equal(forgot.data.demoLink, undefined, 'the link must never be returned');
  const { rows } = await db.query(
    "SELECT body FROM email_outbox WHERE to_email = $1 AND subject = 'Reset your GOG password' ORDER BY id DESC LIMIT 1",
    [ctx.other.email]
  );
  const token = rows[0].body.match(/token=([a-f0-9]+)/)[1];
  assert.equal((await c.post('/auth/reset', { token, password: 'N3wPassw0rd!' })).status, 200);
  assert.equal((await c.post('/auth/reset', { token, password: 'An0therPass!' })).status, 400, 'a link works only once');
  assert.equal((await client().post('/auth/login', { email: ctx.other.email, password: 'Passw0rd!' })).status, 401);
  assert.equal((await client().post('/auth/login', { email: ctx.other.email, password: 'N3wPassw0rd!' })).status, 200);
});

test('FR 4.3 / BR 9: a closed challenge refuses applications', async () => {
  const id = await publish(owner, 'Closed challenge');
  assert.equal((await member.post(`/challenges/${id}/close`)).status, 403, 'only the owner can close it');
  assert.equal((await owner.post(`/challenges/${id}/close`)).status, 200);
  assert.equal((await owner.get(`/challenges/${id}`)).data.challenge.status, 'closed');
  assert.equal((await member.post(`/challenges/${id}/applications`, motivation)).status, 400);
});

test('FR 4.4: a challenge closes automatically after its deadline', async () => {
  const id = await publish(owner, 'Auto close challenge');
  await db.query("UPDATE challenges SET deadline = CURRENT_DATE - 1 WHERE id = $1", [id]);
  assert.equal((await owner.get('/challenges/mine')).status, 200);
  const { rows } = await db.query('SELECT status FROM challenges WHERE id = $1', [id]);
  assert.equal(rows[0].status, 'closed');
  assert.equal((await member.post(`/challenges/${id}/applications`, motivation)).status, 400);
});

test('FR 8.3: only the project owner assigns team roles', async () => {
  const id = await publish(owner, 'Team roles challenge');
  const app = await member.post(`/challenges/${id}/applications`, motivation);
  assert.equal(app.status, 201);
  const appId = app.data.application.id;
  assert.equal((await owner.post(`/applications/${appId}/decision`, { decision: 'accepted' })).status, 200);
  assert.equal((await owner.post(`/applications/${appId}/invite`)).status, 200);
  const inv = (await member.get('/invitations/mine')).data.invitations.find((i) => i.challenge_id === id);
  assert.equal((await member.post(`/invitations/${inv.id}/respond`, { response: 'confirmed' })).status, 200);
  const team = await owner.post(`/challenges/${id}/project`, { name: 'Roles team' });
  assert.equal(team.status, 201);
  ctx.projectId = team.data.project.id;
  const url = `/projects/${ctx.projectId}/members/${ctx.member.id}`;
  assert.equal((await member.put(url, { role: 'Lead' })).status, 403);
  assert.equal((await owner.put(url, { role: 'Research lead' })).status, 200);
  const { rows } = await db.query('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [ctx.projectId, ctx.member.id]);
  assert.equal(rows[0].role, 'Research lead');
});

test('FR 12.1: suspending and unlocking an account', async () => {
  const target = client();
  const user = await signUp(target, 'RuleBanned', 'participant');
  assert.equal((await admin.post(`/admin/users/${user.id}/ban`, { reason: 'Spam' })).status, 200);
  assert.equal((await target.get('/dashboard')).status, 401);
  assert.equal((await client().post('/auth/login', { email: user.email, password: 'Passw0rd!' })).status, 403);
  assert.equal((await admin.post(`/admin/users/${user.id}/ban`)).status, 200);
  assert.equal((await client().post('/auth/login', { email: user.email, password: 'Passw0rd!' })).status, 200);
});

test('FR 12.2 / 12.3: reports, content removal and dismissal', async () => {
  const removed = await publish(owner, 'Reported challenge');
  assert.equal((await member.post('/reports', { target_type: 'challenge', target_id: removed, reason: 'Asks for payment' })).status, 201);
  assert.equal((await member.post(`/admin/challenges/${removed}/remove`, { reason: 'x' })).status, 403);
  assert.equal((await admin.post(`/admin/challenges/${removed}/remove`, {})).status, 400, 'a reason is required');
  assert.equal((await admin.post(`/admin/challenges/${removed}/remove`, { reason: 'Asks for payment' })).status, 200);
  const list = (await admin.get('/admin/reports')).data.reports;
  assert.equal(list.find((r) => r.target_type === 'challenge' && r.target_id === removed).status, 'resolved');
  const notes = (await owner.get('/notifications')).data.notifications;
  assert.ok(notes.some((n) => n.type === 'challenge_removed'));

  const kept = await publish(owner, 'Fine challenge');
  assert.equal((await member.post('/reports', { target_type: 'challenge', target_id: kept, reason: 'Not sure' })).status, 201);
  const open = (await admin.get('/admin/reports')).data.reports.find((r) => r.target_id === kept && r.status === 'open');
  assert.equal((await admin.post(`/admin/reports/${open.id}/dismiss`)).status, 200);
  const audit = (await admin.get('/admin/audit')).data.entries;
  assert.ok(audit.some((e) => e.action === 'remove_challenge' && e.target_id === removed));
  assert.ok(audit.some((e) => e.action === 'dismiss_report' && e.target_id === kept));
});

test('FR 12.5: the pilot report is for administrators and covers every target', async () => {
  assert.equal((await member.get('/admin/pilot-report')).status, 403);
  const r = await admin.get('/admin/pilot-report');
  assert.equal(r.status, 200);
  assert.equal(r.data.targets.length, 6);
  assert.ok(r.data.targets.every((t) => typeof t.met === 'boolean'));
});

test('NFR 15: deleting an account needs the password and keeps the audit log', async () => {
  const c = client();
  const user = await signUp(c, 'RuleDeleted', 'participant');
  const auditBefore = (await db.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n;
  const wrong = await c.post('/auth/delete-account', { password: 'wrong-password1' });
  assert.equal(wrong.status, 400);
  assert.ok(wrong.data.fields.password);
  assert.equal((await owner.post('/auth/delete-account', { password: 'Passw0rd!' })).status, 409, 'active project owners must finish first');
  assert.equal((await admin.post('/auth/delete-account', { password: 'Demo1234' })).status, 403);
  assert.equal((await c.post('/auth/delete-account', { password: 'Passw0rd!' })).status, 200);
  assert.equal((await client().post('/auth/login', { email: user.email, password: 'Passw0rd!' })).status, 401);
  const { rows } = await db.query(
    `SELECT (SELECT count(*)::int FROM users WHERE id = $1) AS users,
            (SELECT count(*)::int FROM email_outbox WHERE to_email = $2) AS emails,
            (SELECT count(*)::int FROM audit_log) AS audit,
            (SELECT details FROM audit_log WHERE action = 'delete_account' AND target_id = $1) AS details`,
    [user.id, user.email]
  );
  assert.equal(rows[0].users, 0);
  assert.equal(rows[0].emails, 0);
  assert.equal(rows[0].audit, auditBefore + 1);
  assert.ok(!rows[0].details.includes(user.email), 'no personal data in the audit entry');
});
