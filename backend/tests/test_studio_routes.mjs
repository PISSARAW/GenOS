import assert from 'node:assert/strict';
import { destinations, parseRoute, routeHash } from '../../integrations/studio/routes.mjs';

for (const [slug, view] of destinations) {
  assert.deepEqual(parseRoute('#/' + slug + '?run=run-123'), { view, runId: 'run-123' });
  assert.equal(routeHash({ view, runId: 'run-123' }), '#/' + slug + '?run=run-123');
}
for (const value of ['javascript:alert(1)', '../secret', '<script>', 'a'.repeat(201), 'x\n', '']) {
  assert.equal(parseRoute('#/runs?run=' + encodeURIComponent(value)).runId, null);
}
assert.equal(parseRoute('#/__proto__').view, 'inspection');
assert.equal(routeHash(parseRoute('#/gestion?token=secret&project=foreign')), '#/gestion');
assert.equal(routeHash({ view: 'invalid', runId: null }), '#/runs');
console.log('Studio routes: destinations, bounded identifiers, unknown routes and secret stripping passed.');
