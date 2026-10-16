'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');

async function createClaimBarrier(backend) {
  let releaseResponse;
  let claimStarted;
  const waitForClaim = new Promise(resolve => { claimStarted = resolve; });
  const responseGate = new Promise(resolve => { releaseResponse = resolve; });
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const upstream = await fetch(`http://127.0.0.1:${backend.port}${request.url}`, {
      method: request.method,
      headers: { authorization: request.headers.authorization,
        'content-type': request.headers['content-type'],
        'x-organization-id': request.headers['x-organization-id'],
        'x-project-id': request.headers['x-project-id'] },
      body: Buffer.concat(chunks),
    });
    const body = await upstream.text();
    response.writeHead(upstream.status, { 'content-type': 'application/json' });
    if (!request.url.endsWith('/claim')) return response.end(body);
    const split = Math.max(1, Math.floor(body.length / 2));
    response.write(body.slice(0, split));
    claimStarted();
    await responseGate;
    response.end(body.slice(split));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { url: `http://127.0.0.1:${server.address().port}`, waitForClaim,
    release: releaseResponse, close: () => new Promise(resolve => server.close(resolve)) };
}

async function expireClaim(backend, authorizationId) {
  const response = once(backend.child, 'message');
  backend.child.send({ action: 'expire-clinical-claim', authorizationId });
  const [result] = await response;
  if (result.error) throw new Error(result.error);
  assert.equal(result.expired, true);
}

module.exports = { createClaimBarrier, expireClaim };
