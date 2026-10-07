import assert from 'node:assert/strict';
import { StudioClient } from '../../integrations/studio/client.mjs';

const session = { token: 'fixture-only', organization: 'one', project: 'alpha' };
const response = value => ({ ok: true, status: 200, json: async () => value });
const clientFor = transport => {
  const client = new StudioClient(transport);
  client.setSession(session);
  return client;
};

const calls = [];
const bounded = clientFor(async (endpoint, options) => {
  calls.push({ endpoint, options });
  return response({ accepted: true });
});
for (const endpoint of ['https://other.invalid/api/read', '//other.invalid/api/read', '/studio/',
  '/api/../outside', '/api/read#fragment', '/api/\\other.invalid']) {
  await assert.rejects(bounded.request(endpoint), error => error.kind === 'validation');
}
assert.equal(calls.length, 0);
await bounded.request('/api/read?q=one');
assert.equal(calls[0].options.redirect, 'error');
assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-only');
for (const body of [false, 0, '', null]) {
  await bounded.request('/api/write', { body });
  assert.equal(calls.at(-1).options.method, 'POST');
  assert.equal(calls.at(-1).options.body, JSON.stringify(body));
}
await assert.rejects(bounded.request('/api/read', { method: 'GET', body: {} }), error => error.kind === 'validation');
await assert.rejects(bounded.request('/api/read', { method: 'TRACE' }), error => error.kind === 'validation');
assert.equal(await clientFor(async () => ({ ok: true, status: 204 })).request('/api/write', { method: 'DELETE' }), null);

for (const status of [401, 403, 502]) {
  const client = clientFor(async () => ({ ok: false, status, json: async () => { throw new SyntaxError('html'); } }));
  await assert.rejects(client.request('/api/read'), error => error.status === status && error.kind === 'protocol');
}
const rejected = clientFor(async () => response({ success: false, error: { code: 'GATE_REFUSED' } }));
await assert.rejects(rejected.request('/api/write', { body: {} }), error =>
  error.kind === 'decision' && error.code === 'GATE_REFUSED' && !error.retryable);

const ignoredAbort = clientFor(() => new Promise(() => {}));
await assert.rejects(ignoredAbort.request('/api/read', { timeoutMs: 5 }), error =>
  error.name === 'AbortError' && error.kind === 'timeout' && error.retryable);
await assert.rejects(ignoredAbort.request('/api/write', { body: {}, timeoutMs: 5 }), error =>
  error.outcome === 'unknown' && !error.retryable);
assert.equal(ignoredAbort.controllers.size, 0);

const signal = new AbortController();
signal.abort();
await assert.rejects(bounded.request('/api/read', { signal: signal.signal }), error => error.outcome === 'not-dispatched');
const cancel = new AbortController();
const cancelled = ignoredAbort.request('/api/read', { signal: cancel.signal });
cancel.abort();
await assert.rejects(cancelled, error => error.kind === 'cancelled');
const stale = ignoredAbort.request('/api/read');
ignoredAbort.setSession({ ...session, project: 'beta' });
await assert.rejects(stale, error => error.kind === 'session');

let release;
const slowJson = clientFor(async () => ({ ok: true, status: 200,
  json: () => new Promise(resolve => { release = resolve; }) }));
const reading = slowJson.request('/api/read');
await new Promise(resolve => setTimeout(resolve, 0));
slowJson.setSession(null);
release({ foreign: true });
await assert.rejects(reading, error => error.kind === 'session');
assert.equal(slowJson.controllers.size, 0);
console.log('Studio request safety: confined transport, redirects, falsy bodies, HTTP/decision failures, deadlines and cancellation passed.');
