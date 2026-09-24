'use strict';

const assert = require('assert');
const runtime = require('../src/services/symbioteRuntimeService');

function run() {
  const contract = { capabilitiesOffered: ['summarize'], dataAccess: ['public'], toolLeases: [] };
  const engines = [
    { engine: 'cloud', latencyMs: 120, cost: 2, providerReliability: 0.99, capabilities: ['summarize'] },
    { engine: 'local', local: true, latencyMs: 20, cost: 0, providerReliability: 0.9, capabilities: ['summarize'] },
    { engine: 'solver', latencyMs: 1, cost: 0, providerReliability: 1, capabilities: ['math'] }
  ];
  assert.strictEqual(runtime.engineForSymbiont(contract, { engines, privacy: 'LOCAL_ONLY' }), 'local');
  assert.strictEqual(runtime.engineForSymbiont(contract, { engines, requiredCapabilities: ['summarize'] }), 'local');
  assert.strictEqual(runtime.engineForSymbiont(contract, { engines, requiredCapabilities: ['math'] }), 'solver');
  assert.strictEqual(runtime.engineForSymbiont(contract, { requiresLLM: false }), 'no_llm');
  assert.throws(() => runtime.engineForSymbiont(contract, {
    engines, requiredTools: ['database_read'], maxLatencyMs: 10
  }), { code: 'HOLOBIONT_ENGINE_UNAVAILABLE' });
}

run();
console.log('✅ Holobiont contract engine routing tests passed.');
