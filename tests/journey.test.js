// End to end test of the core GOG journey through the REST API:
// Challenge -> Application -> Selection -> Team -> Private Project Workspace.
// Start the server with DEMO_MODE=true first, then run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:4000';
const stamp = Date.now();

// Minimal client that keeps its own session cookie.
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
    const res = await fetch(BASE + '/api' + path, { method, headers, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b = {}) => call('POST', p, b),
    put: (p, b = {}) => call('PUT', p, b),
    raw: call,
  };
}

async function signUp(c, role, name) {
  const email = `${name.toLowerCase()}.${stamp}@test.rw`;
  const reg = await c.post('/auth/register', { fullName: name, email, password: 'Passw0rd!', role });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const token = new URL(reg.data.demoLink).searchParams.get('token');
  const confirm = await c.post('/auth/confirm', { token });
  assert.equal(confirm.status, 200);
  const login = await c.post('/auth/login', { email, password: 'Passw0rd!' });
  assert.equal(login.status, 200);
  return { email, id: login.data.user.id };
}

const owner = client();
const alice = client();
const bob = client();
const outsider = client();
const admin = client();
const ctx = {};

test('FR 1: register, confirm email and log in', async () => {
  ctx.owner = await signUp(owner, 'owner', 'Owner');
  ctx.alice = await signUp(alice, 'participant', 'Alice');
  ctx.bob = await signUp(bob, 'participant', 'Bob');
  ctx.outsider = await signUp(outsider, 'participant', 'Outsider');
  const me = await owner.get('/auth/me');
  assert.equal(me.data.user.email, ctx.owner.email);
});

test('FR 1.1: duplicate email is refused', async () => {
  const r = await client().post('/auth/register', { fullName: 'X', email: ctx.alice.email, password: 'Passw0rd!', role: 'participant' });
  assert.equal(r.status, 400);
});

test('CSRF: requests without the custom header are blocked', async () => {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ctx.alice.email, password: 'Passw0rd!' }),
  });
  assert.equal(res.status, 403);
});

test('BR 1: an incomplete profile cannot create a challenge', async () => {
  const r = await owner.post('/challenges', {
    title: 'Test', description: 'd', sector: 'Health', skills: ['x'], outcome: 'o', deadline: '2099-01-01', team_size: 2,
  });
  assert.equal(r.status, 403);
});

test('FR 2: participants complete their profiles', async () => {
  for (const c of [owner, alice, bob]) {
    const r = await c.put('/profile', {
      full_name: 'Test User', bio: 'Bio', skills: ['Research', 'Design'], location: 'Kigali',
      experiences: 'Exchange in Ghana',
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.status.complete, true);
  }
});

test('FR 4: owner creates a draft, then publishes it', async () => {
  const r = await owner.post('/challenges', {
    title: `Journey test challenge ${stamp}`, description: 'A test problem.', sector: 'Health',
    skills: ['Research'], outcome: 'A result.', deadline: '2099-12-31', team_size: 2,
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.challenge.status, 'draft');
  ctx.challengeId = r.data.challenge.id;
  const pub = await owner.post(`/challenges/${ctx.challengeId}/publish`);
  assert.equal(pub.status, 200);
});

test('FR 4.5: only the owner can edit a challenge', async () => {
  const r = await alice.put(`/challenges/${ctx.challengeId}`, {
    title: 'Hacked', description: 'x', sector: 'Health', skills: ['x'], outcome: 'x', deadline: '2099-12-31', team_size: 2,
  });
  assert.equal(r.status, 403);
});

test('FR 5: the challenge can be found by keyword and filter', async () => {
  const r = await client().get(`/challenges?q=${stamp}&sector=Health&skill=research`);
  assert.equal(r.status, 200);
  assert.ok(r.data.challenges.some((c) => c.id === ctx.challengeId));
});

test('FR 6: apply, no duplicates, no self application', async () => {
  const a = await alice.post(`/challenges/${ctx.challengeId}/applications`, { motivation: 'I studied this problem abroad and can help.' });
  assert.equal(a.status, 201);
  ctx.aliceApp = a.data.application.id;
  const dup = await alice.post(`/challenges/${ctx.challengeId}/applications`, { motivation: 'Applying again to the same challenge.' });
  assert.equal(dup.status, 400);
  const self = await owner.post(`/challenges/${ctx.challengeId}/applications`, { motivation: 'I want to apply to my own challenge.' });
  assert.equal(self.status, 400);
  const b = await bob.post(`/challenges/${ctx.challengeId}/applications`, { motivation: 'I have research skills for this challenge.' });
  assert.equal(b.status, 201);
  ctx.bobApp = b.data.application.id;
});

test('FR 2.3: owner sees full profile only after the user applies', async () => {
  const applied = await owner.get(`/users/${ctx.alice.id}`);
  assert.equal(applied.data.restricted, false);
  const notApplied = await owner.get(`/users/${ctx.outsider.id}`);
  assert.equal(notApplied.data.restricted, true);
});

test('FR 6.5: participant can withdraw before a decision', async () => {
  const r = await bob.post(`/applications/${ctx.bobApp}/withdraw`);
  assert.equal(r.status, 200);
  const mine = await bob.get('/applications/mine');
  assert.equal(mine.data.applications.find((a) => a.id === ctx.bobApp).status, 'withdrawn');
});

test('FR 7: owner reviews, accepts and invites; BR 2 others cannot decide', async () => {
  const list = await owner.get(`/challenges/${ctx.challengeId}/applications`);
  assert.equal(list.status, 200);
  assert.equal(list.data.applications.find((a) => a.id === ctx.aliceApp).status, 'under_review');
  const notOwner = await alice.post(`/applications/${ctx.aliceApp}/decision`, { decision: 'accepted' });
  assert.equal(notOwner.status, 403);
  const accept = await owner.post(`/applications/${ctx.aliceApp}/decision`, { decision: 'accepted' });
  assert.equal(accept.status, 200);
  const invite = await owner.post(`/applications/${ctx.aliceApp}/invite`);
  assert.equal(invite.status, 200);
});

test('BR 5: no team before at least one confirmed participant', async () => {
  const r = await owner.post(`/challenges/${ctx.challengeId}/project`, { name: 'Too early' });
  assert.equal(r.status, 400);
});

test('FR 7.4 / FR 8: participant confirms and owner forms the team', async () => {
  const inv = await alice.get('/invitations/mine');
  const mine = inv.data.invitations.find((i) => i.challenge_id === ctx.challengeId);
  const confirm = await alice.post(`/invitations/${mine.id}/respond`, { response: 'confirmed' });
  assert.equal(confirm.status, 200);
  const team = await owner.post(`/challenges/${ctx.challengeId}/project`, { name: 'Journey team' });
  assert.equal(team.status, 201);
  ctx.projectId = team.data.project.id;
  const again = await owner.post(`/challenges/${ctx.challengeId}/project`, { name: 'Second team' });
  assert.equal(again.status, 400, 'BR 6: one project per challenge');
});

test('FR 9.1 / NFR 4: workspace is private to the team', async () => {
  assert.equal((await alice.get(`/projects/${ctx.projectId}`)).status, 200);
  assert.equal((await outsider.get(`/projects/${ctx.projectId}`)).status, 403);
  assert.equal((await client().get(`/projects/${ctx.projectId}`)).status, 401);
});

test('FR 9: tasks, milestones, notes, posts, files and progress', async () => {
  const t = await alice.post(`/projects/${ctx.projectId}/tasks`, { title: 'Interview users', assignee_id: ctx.alice.id });
  assert.equal(t.status, 201);
  await alice.put(`/projects/${ctx.projectId}/tasks/${t.data.task.id}`, { status: 'done' });
  await alice.post(`/projects/${ctx.projectId}/tasks`, { title: 'Write report' });

  const blocked = await alice.post(`/projects/${ctx.projectId}/milestones`, { title: 'Member cannot add' });
  assert.equal(blocked.status, 403, 'FR 9.7: only the owner sets milestones');
  const m = await owner.post(`/projects/${ctx.projectId}/milestones`, { title: 'Research done' });
  assert.equal(m.status, 201);

  const ov = await owner.get(`/projects/${ctx.projectId}`);
  assert.equal(ov.data.progress.percent, 33, 'FR 9.8: 1 of 3 items done');

  assert.equal((await alice.post(`/projects/${ctx.projectId}/notes`, { title: 'Source', link: 'https://example.org' })).status, 201);
  const post = await alice.post(`/projects/${ctx.projectId}/posts`, { body: 'Hello team' });
  assert.equal(post.status, 201);
  assert.equal((await owner.post(`/projects/${ctx.projectId}/posts`, { body: 'Hi', parent_id: post.data.post.id })).status, 201);

  const fd = new FormData();
  fd.append('file', new Blob(['a,b\n1,2\n'], { type: 'text/csv' }), 'data.csv');
  assert.equal((await alice.raw('POST', `/projects/${ctx.projectId}/files`, fd)).status, 201);
  const bad = new FormData();
  bad.append('file', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'virus.exe');
  assert.equal((await alice.raw('POST', `/projects/${ctx.projectId}/files`, bad)).status, 400, 'only approved file types');
});

