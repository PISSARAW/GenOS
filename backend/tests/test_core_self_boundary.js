'use strict';

const assert = require('node:assert/strict');
const core = require('../src/services/coreSelfService');

function memoryDb() {
  const states = new Map();
  const claims = {
    'agent-A': [{ claim_json: JSON.stringify({ origin: 'SelfGenerated' }) }],
    'agent-B': [{ claim_json: JSON.stringify({ origin: 'ExternalObserved' }) }]
  };
  return {
    get: async (_sql, scope, key) => states.has(`${scope}|${key}`)
      ? { payload_json: states.get(`${scope}|${key}`) } : null,
    all: async (sql, agentId) => {
      assert.match(sql, /producer_agent_id = \?/);
      return claims[agentId] || [];
    },
    run: async (...args) => {
      const [sql, scope, key, payload] = args;
      if (!String(sql).includes('adaptive_state_events')) states.set(`${scope}|${key}`, payload);
    }
  };
}

async function main() {
  const db = memoryDb();
  await core.recordAttribution(db, 'agent-A', {
    actionId: 'external-event', attributedToSelf: false, predictionError: 0
  });
  const a = await core.loadCoreSelf(db, 'agent-A');
  assert.equal(a.agencyCalibration, 0);
  assert.equal(a.selfAttributionRate, 0);
  assert.equal(a.meanPredictionError, 0);
  assert.equal(a.selfOriginRatio, 1);
  await core.recordAttribution(db, 'agent-B', {
    actionId: 'own-event', attributedToSelf: true, predictionError: 0.2
  });
  const b = await core.loadCoreSelf(db, 'agent-B');
  assert.equal(b.agencyCalibration, 0.8);
  assert.equal(b.selfAttributionRate, 1);
  assert.equal(b.meanPredictionError, 0.2);
  assert.equal(b.selfOriginRatio, 0);
  console.log('Core self attribution and claim origins are scoped to each agent.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
