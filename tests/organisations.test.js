// End to end tests for organisation verification (FR 3).
// Start the server with DEMO_MODE=true and PROTECT_DEMO=false first, then run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:4000';
const stamp = `${Date.now()}org`;

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
  return { get: (p) => call('GET', p), post: (p, b = {}) => call('POST', p, b) };
}

async function signUp(c, name) {
  const email = `${name.toLowerCase()}.${stamp}@test.rw`;
  const reg = await c.post('/auth/register', { fullName: name, email, password: 'Passw0rd!', role: 'owner' });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const token = new URL(reg.data.demoLink).searchParams.get('token');
  assert.equal((await c.post('/auth/confirm', { token })).status, 200);
  assert.equal((await c.post('/auth/login', { email, password: 'Passw0rd!' })).status, 200);
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

const approved = client();
const rejected = client();
const stranger = client();
const admin = client();
const ctx = {};

test('FR 3.1 / 3.2: an organisation is submitted with documents and starts as pending', async () => {
  await signUp(approved, 'Approved');
  await signUp(rejected, 'Rejected');
  await signUp(stranger, 'Stranger');
  const first = await approved.post('/organisations', orgForm(`Approved Org ${stamp}`));
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.equal(first.data.organisation.status, 'pending');
  ctx.approvedId = first.data.organisation.id;
  const second = await rejected.post('/organisations', orgForm(`Rejected Org ${stamp}`));
  assert.equal(second.status, 201, JSON.stringify(second.data));
  ctx.rejectedId = second.data.organisation.id;

  const mine = await approved.get('/organisations/mine');
  assert.equal(mine.data.documents.length, 1);
  ctx.docId = mine.data.documents[0].id;
  assert.equal((await approved.post('/organisations', orgForm('Duplicate'))).status, 400, 'one organisation per representative');
});

test('FR 3.3: only an administrator can decide, and documents stay private', async () => {
  assert.equal((await approved.post(`/admin/organisations/${ctx.approvedId}/decision`, { decision: 'verified' })).status, 403);
  assert.equal((await stranger.get(`/organisations/${ctx.approvedId}/documents/${ctx.docId}`)).status, 403);
  assert.equal((await admin.post('/auth/login', { email: 'admin@gog.rw', password: 'Demo1234' })).status, 200);
  const list = await admin.get('/admin/organisations?status=pending');
  assert.ok(list.data.organisations.some((o) => o.id === ctx.approvedId));
});

test('FR 3.3 / 3.4 / 3.5: approval gives the Verified status and notifies the representative', async () => {
  const r = await admin.post(`/admin/organisations/${ctx.approvedId}/decision`, { decision: 'verified' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const page = await stranger.get(`/organisations/${ctx.approvedId}`);
  assert.equal(page.data.organisation.status, 'verified');
  const notes = await approved.get('/notifications');
  assert.ok(notes.data.notifications.some((n) => n.type === 'verification_decision' && /now verified/.test(n.message)));
  const audit = await admin.get('/admin/audit');
  assert.ok(audit.data.entries.some((e) => e.action === 'verify_organisation' && e.target_id === ctx.approvedId));
});

test('FR 3.3 / 3.5: rejection needs a reason, and the representative can see it and resubmit', async () => {
  const url = `/admin/organisations/${ctx.rejectedId}/decision`;
  assert.equal((await admin.post(url, { decision: 'rejected' })).status, 400, 'a reason is required');
  const reason = 'The registration document is unreadable.';
  assert.equal((await admin.post(url, { decision: 'rejected', reason })).status, 200);
  const mine = await rejected.get('/organisations/mine');
  assert.equal(mine.data.organisation.status, 'rejected');
  assert.equal(mine.data.organisation.rejection_reason, reason);
  const notes = await rejected.get('/notifications');
  assert.ok(notes.data.notifications.some((n) => n.type === 'verification_decision' && n.message.includes(reason)));
  const again = await rejected.post('/organisations', orgForm(`Rejected Org Fixed ${stamp}`));
  assert.equal(again.status, 201);
  assert.equal(again.data.organisation.status, 'pending');
});
