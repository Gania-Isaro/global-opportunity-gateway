// Checks that emails go through the Brevo API without contacting the real service.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const received = [];
let status = 201;
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    received.push({ key: req.headers['api-key'], body: JSON.parse(raw) });
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end('{}');
  });
});
let mailer;
let db;

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.BREVO_API_KEY = 'test-key';
  process.env.BREVO_API_URL = `http://127.0.0.1:${server.address().port}/send`;
  process.env.MAIL_FROM = 'GOG <hello@example.test>';
  mailer = await import('../server/mailer.js');
  db = await import('../server/db.js');
});

after(async () => {
  await db.pool.end();
  await new Promise((resolve) => server.close(resolve));
});

test('FR 10.2: an email is delivered through the Brevo API', async () => {
  assert.equal(mailer.emailMode, 'brevo');
  assert.equal(await mailer.sendEmail('person@example.test', 'Hello', 'A message'), true);
  const { key, body } = received.at(-1);
  assert.equal(key, 'test-key');
  assert.deepEqual(body.sender, { name: 'GOG', email: 'hello@example.test' });
  assert.deepEqual(body.to, [{ email: 'person@example.test' }]);
  assert.equal(body.subject, 'Hello');
  assert.equal(body.textContent, 'A message');
});

test('FR 1.2: a failed delivery is reported instead of crashing signup', async () => {
  status = 401;
  assert.equal(await mailer.sendEmail('person@example.test', 'Hello', 'A message'), false);
  status = 201;
});

test('MAIL_FROM works with or without a display name', () => {
  assert.deepEqual(mailer.parseSender('Team <team@example.test>'), { name: 'Team', email: 'team@example.test' });
  assert.deepEqual(mailer.parseSender('team@example.test'), { name: 'GOG', email: 'team@example.test' });
});
