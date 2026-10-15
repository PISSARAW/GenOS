'use strict';

const assert = require('node:assert/strict');
const { routeRateLimit } = require('../src/middleware/routeRateLimit');
const routeModules = [
  require('../src/routes/rustBridgeRoutes'),
  require('../src/routes/releaseRoutes'),
  require('../src/routes/lineageRoutes'),
  require('../src/routes/memoryRoutes'),
  require('../src/routes/workspaceRoutes'),
  require('../src/routes/productProofRoutes'),
  require('../src/routes/experimentRoutes'),
  require('../src/routes/commandRoutes'),
  require('../src/routes/daemonRoutes'),
  require('../src/routes/ssoRoutes'),
  require('../src/routes/signalDeliveryRoutes'),
  require('../src/routes/signalReceptorRoutes'),
  require('../src/routes/signalCognitiveRoutes'),
  require('../src/routes/deployRoutes'),
  require('../src/routes/studioGenosRoutes').router,
  require('../src/routes/studioProductionRoutes').router
];

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

let passed = 0;
let limited = null;
for (let i = 0; i < 121; i += 1) {
  const response = makeResponse();
  routeRateLimit({ ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, headers: {},
    method: 'GET', originalUrl: '/security-test-route', url: '/security-test-route' },
  response, () => { passed += 1; });
  if (response.statusCode === 429) limited = response;
}
assert.equal(passed, 120);
assert.equal(limited?.statusCode, 429);
assert.ok(Number(limited?.headers['retry-after']) > 0);
for (const router of routeModules) {
  const target = router.router || router;
  assert.ok(target.stack.some((layer) => layer.handle === routeRateLimit), 'Every alert-target route group must install request throttling.');
}
console.log('Route rate limit passed.');
