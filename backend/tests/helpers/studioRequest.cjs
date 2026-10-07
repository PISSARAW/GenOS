'use strict';
async function request(spec, route, options = {}) {
  const response = await fetch(spec.url + route, { method: options.method || (options.body ? 'POST' : 'GET'),
    signal: AbortSignal.timeout(options.timeoutMs || 5000),
    headers: { Authorization: `Bearer ${spec.token}`, 'X-Organization-Id': 'b06-org',
      'X-Project-Id': options.project || 'b06-project', 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined });
  return { status: response.status, value: await response.json() };
}
module.exports = { request };
