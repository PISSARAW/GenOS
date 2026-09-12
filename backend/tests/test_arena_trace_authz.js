const assert = require('node:assert/strict');

function handlerCount(router, method, routePath) {
  const layer = router.stack.find((entry) => entry.route && entry.route.path === routePath && entry.route.methods[method]);
  return layer ? layer.route.stack.length : 0;
}

(async () => {
  const arena = require('../src/routes/arenaRoutes');
  const trace = require('../src/routes/traceRoutes');

  assert.ok(handlerCount(arena, 'post', '/run') >= 2, 'arena POST /run requires a permission guard');
  assert.ok(handlerCount(arena, 'post', '/tournament') >= 2, 'arena POST /tournament requires a permission guard');
  assert.equal(handlerCount(arena, 'get', '/trace'), 2, 'arena GET /trace is read-guarded');

  assert.ok(handlerCount(trace, 'post', '/ingest') >= 2, 'trace POST /ingest requires a permission guard');
  assert.ok(handlerCount(trace, 'post', '/:traceId/replay') >= 2, 'trace POST replay requires a permission guard');

  console.log('Arena/Trace authorization guard checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
