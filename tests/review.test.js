// End to end tests for the fixes from my SRS review.
// Start the server with DEMO_MODE=true and PROTECT_DEMO=false first, then run: npm test
import 'dotenv/config';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const BASE = process.env.BASE_URL || 'http://localhost:4000';
const stamp = `${Date.now()}review`;
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
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${BASE}/api${path}`, { method, headers, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };
  return { get: (p) => call('GET', p), post: (p, b = {}) => call('POST', p, b), put: (p, b = {}) => call('PUT', p, b) };
}

let counter = 0;
async function account(role = 'participant') {
  const c = client();
  counter += 1;
  const name = `Review${counter}`;
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
  return { c, email, id: login.data.user.id };
}

const challengeBody = (teamSize) => ({
  title: `Review challenge ${stamp} ${counter}`, description: 'A test problem.', sector: 'Health',
  skills: ['Research'], outcome: 'A result.', deadline: '2099-12-31', team_size: teamSize,
});

async function publish(owner, teamSize = 2) {
  const r = await owner.c.post('/challenges', { ...challengeBody(teamSize), publish: true });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.challenge.id;
}

async function apply(user, challengeId) {
  const r = await user.c.post(`/challenges/${challengeId}/applications`, { motivation: 'I studied this problem abroad and can help.' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.application.id;
}

// Takes one participant from applying to a confirmed invitation.
async function confirmMember(owner, user, challengeId) {
  const appId = await apply(user, challengeId);
  assert.equal((await owner.c.post(`/applications/${appId}/decision`, { decision: 'accepted' })).status, 200);
  assert.equal((await owner.c.post(`/applications/${appId}/invite`)).status, 200);
  const inv = (await user.c.get('/invitations/mine')).data.invitations.find((i) => i.challenge_id === challengeId);
  assert.equal((await user.c.post(`/invitations/${inv.id}/respond`, { response: 'confirmed' })).status, 200);
  return appId;
}

async function project(owner, user) {
  const challengeId = await publish(owner);
  await confirmMember(owner, user, challengeId);
  const r = await owner.c.post(`/challenges/${challengeId}/project`, { name: `Review project ${stamp}` });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.project.id;
}

function orgForm(name) {
  const form = new FormData();
  form.set('name', name);
  form.set('sector', 'Education');
  form.set('description', 'A Kigali organisation used to test verification.');
  form.set('contact_person', 'Test Contact');
  form.append('documents', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'registration.pdf');
  return form;
}

const admin = client();

test('setup: log in as the administrator', async () => {
  assert.equal((await admin.post('/auth/login', { email: 'admin@gog.rw', password: 'Demo1234' })).status, 200);
});

test('FR 12.2: a removed challenge cannot move forward', async () => {
  const owner = await account('owner');
  const accepted = await account();
  const waiting = await account();
  const challengeId = await publish(owner);
  await confirmMember(owner, accepted, challengeId);
  const waitingApp = await apply(waiting, challengeId);
  assert.equal((await admin.post(`/admin/challenges/${challengeId}/remove`, { reason: 'Breaks the rules' })).status, 200);
  assert.equal((await owner.c.post(`/applications/${waitingApp}/decision`, { decision: 'accepted' })).status, 400);
  assert.equal((await owner.c.post(`/applications/${waitingApp}/invite`)).status, 400);
  assert.equal((await owner.c.post(`/challenges/${challengeId}/project`, { name: 'Should fail' })).status, 400);
});

test('FR 12.5: the pilot report counts real measures', async () => {
  const owner = await account('owner');
  const member = await account();
  const outsider = await account();
  const projectId = await project(owner, member);
  assert.equal((await outsider.c.get(`/projects/${projectId}`)).status, 403);
  const { rows: [denied] } = await db.query('SELECT count(*)::int AS n FROM workspace_denials WHERE project_id = $1 AND user_id = $2', [projectId, outsider.id]);
  assert.equal(denied.n, 1, 'the blocked attempt is recorded');

  const report = await admin.get('/admin/pilot-report');
  assert.equal(report.data.data_scope, 'demo');
  const { rows: [expected] } = await db.query("SELECT count(*)::int AS n FROM users WHERE role = 'participant' AND email_verified AND is_demo");
  assert.equal(report.data.metrics.participants, expected.n, 'owners and other scopes are not counted');
  const published = report.data.targets.find((t) => t.label === 'Published challenges');
  const both = report.data.metrics.published_by_org > 0 && report.data.metrics.published_by_individual > 0;
  assert.equal(published.met, published.actual >= 10 && both);
});

test('FR 3.4: only verified organisation names are public, and old challenges get the badge', async () => {
  const owner = await account('owner');
  const challengeId = await publish(owner);
  const orgName = `Known Organisation ${stamp}`;
  const org = await owner.c.post('/organisations', orgForm(orgName));
  assert.equal(org.status, 201, JSON.stringify(org.data));
  const later = await publish(owner);

  const visitor = client();
  const pending = (await visitor.get(`/challenges/${later}`)).data.challenge;
  assert.equal(pending.org_name, null, 'a pending name stays hidden');
  assert.equal(pending.verified, false);
  assert.equal((await visitor.get(`/organisations/${org.data.organisation.id}`)).status, 404);

  assert.equal((await admin.post(`/admin/organisations/${org.data.organisation.id}/decision`, { decision: 'verified' })).status, 200);
  for (const id of [challengeId, later]) {
    const c = (await visitor.get(`/challenges/${id}`)).data.challenge;
    assert.equal(c.org_name, orgName);
    assert.equal(c.verified, true);
  }
});

test('Team size: the owner cannot accept or form more than the limit', async () => {
  const owner = await account('owner');
  const first = await account();
  const second = await account();
  const challengeId = await publish(owner, 1);
  const a1 = await apply(first, challengeId);
  const a2 = await apply(second, challengeId);
  assert.equal((await owner.c.post(`/applications/${a1}/decision`, { decision: 'accepted' })).status, 200);
  assert.equal((await owner.c.post(`/applications/${a2}/decision`, { decision: 'accepted' })).status, 400);

  assert.equal((await owner.c.post(`/applications/${a1}/invite`)).status, 200);
  const inv = (await first.c.get('/invitations/mine')).data.invitations.find((i) => i.challenge_id === challengeId);
  assert.equal((await first.c.post(`/invitations/${inv.id}/respond`, { response: 'declined' })).status, 200);
  assert.equal((await owner.c.post(`/applications/${a2}/decision`, { decision: 'accepted' })).status, 200, 'a declined place opens up');
});

test('Section 5.3: file content must match the file type', async () => {
  const owner = await account('owner');
  const member = await account();
  const projectId = await project(owner, member);
  const upload = (bytes, type, name) => {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), name);
    return member.c.post(`/projects/${projectId}/files`, form);
  };
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
  assert.equal((await upload(exe, 'application/pdf', 'report.pdf')).status, 400, 'an exe labelled as a PDF');
  assert.equal((await upload(exe, 'application/pdf', 'report.exe')).status, 400, 'an unapproved extension');
  assert.equal((await upload(exe, 'text/plain', 'notes.txt')).status, 400, 'binary content labelled as text');
  assert.equal((await upload('%PDF-1.4 real', 'application/pdf', 'report.pdf')).status, 201);
  assert.equal((await upload('a,b\n1,2\n', 'application/vnd.ms-excel', 'data.csv')).status, 201, 'Windows labels CSV files as Excel');
});

test('NFR 11: administrator changes in a workspace are audited', async () => {
  const owner = await account('owner');
  const member = await account();
  const projectId = await project(owner, member);
  assert.equal((await admin.post(`/projects/${projectId}/complete`)).status, 200);
  const { rows } = await db.query(
    "SELECT details FROM audit_log WHERE action = 'workspace_change' AND target_type = 'project' AND target_id = $1",
    [projectId]
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0].details, /completed/);
  await owner.c.post(`/projects/${projectId}/complete`);
  const after = await db.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'workspace_change' AND target_id = $1", [projectId]);
  assert.equal(after.rows[0].n, 1, 'the owner is not an administrator action');
});

test('NFR 15: deleting an account removes its email from earlier audit entries', async () => {
  const user = await account();
  await db.query(
    "INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES (NULL, 'suspend_user', 'user', $1, $2)",
    [user.id, `${user.email}: old style entry`]
  );
  assert.equal((await user.c.post('/auth/delete-account', { password: 'Passw0rd!' })).status, 200);
  const { rows } = await db.query('SELECT count(*)::int AS n FROM audit_log WHERE strpos(details, $1) > 0', [user.email]);
  assert.equal(rows[0].n, 0);
});

test('Section 5.3: a password reset ends existing sessions', async () => {
  const user = await account();
  assert.equal((await user.c.get('/dashboard')).status, 200);
  await client().post('/auth/forgot', { email: user.email });
  const { rows } = await db.query(
    "SELECT body FROM email_outbox WHERE to_email = $1 AND subject LIKE 'Reset%' ORDER BY id DESC LIMIT 1",
    [user.email]
  );
  const token = rows[0].body.match(/token=([0-9a-f]+)/)[1];
  assert.equal((await client().post('/auth/reset', { token, password: 'NewPassw0rd!' })).status, 200);
  assert.equal((await user.c.get('/dashboard')).status, 401, 'the old session stops working');
});
