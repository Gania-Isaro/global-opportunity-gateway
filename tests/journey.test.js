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

