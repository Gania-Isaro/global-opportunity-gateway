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

