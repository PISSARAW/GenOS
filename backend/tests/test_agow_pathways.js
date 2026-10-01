'use strict';

const assert = require('node:assert/strict');
const registry = require('../src/services/agow/pathways/directPathwayRegistry');
const router = require('../src/services/agow/pathways/directPathwayRouter');

function database() {
  const objects = new Map();
  return {
    async get(_sql, scope, key) { return objects.has(`${scope}:${key}`) ? { payload_json: objects.get(`${scope}:${key}`) } : null; },
    async run(sql, scope, key, payload) {
      if (sql.includes('INSERT OR REPLACE INTO adaptive_state')) objects.set(`${scope}:${key}`, payload);
      return { changes: 1 };
    }
  };
}

async function main() {
  const db = database();
  const critical = { irreversible: true };
  assert.equal(registry.needsReview(critical), true);
  const route = await registry.register({ agentId: 'pathway-test', db, route: {
    pathwayId: 'memory-verifier', source: 'memory', target: 'verifier', semanticType: 'regression',
    capability: 'verification', contextHash: 'auth-regression', confidence: 0.95,
    status: 'consolidated', requiresGlobalReview: false
  } });
  assert.equal(route.requiresGlobalReview, false);
  const resolved = await registry.resolve({ agentId: 'pathway-test', db, capability: 'verification',
    contextHash: 'auth-regression', targets: ['verifier'] });
  assert.equal(resolved.pathwayId, route.pathwayId);
  assert.equal(await registry.resolve({ agentId: 'pathway-test', db, capability: 'verification',
    contextHash: 'auth-regression', targets: ['memory'] }), null);
  const guarded = await registry.register({ agentId: 'pathway-test', db, route: {
    ...route, pathwayId: 'unsafe', irreversible: true
  } });
  assert.equal(guarded.requiresGlobalReview, true);
  let delivered = null;
  const unsubscribe = router.subscribe('verifier', (event) => { delivered = event; });
  const receipt = router.publish({ route, contextHash: 'auth-regression', semanticType: 'verify_request', payload: { id: 'case-1' } });
  unsubscribe();
  assert.equal(receipt.routed, true);
  assert.equal(delivered.pathwayId, route.pathwayId);
  const suspended = await registry.suspend({ agentId: 'pathway-test', db, pathwayId: route.pathwayId, reason: 'drift' });
  assert.equal(suspended.status, 'suspended');
  assert.equal(await registry.resolve({ agentId: 'pathway-test', db, capability: 'verification',
    contextHash: 'auth-regression', targets: ['verifier'] }), null);
  console.log('✅ AGOW direct pathways, review gates and suspension passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
