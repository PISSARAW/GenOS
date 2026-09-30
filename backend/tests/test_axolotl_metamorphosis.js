'use strict';

const assert = require('node:assert/strict');
const regulator = require('../src/services/development/plasticityRegulatorService');

async function main() {
  const id = `axolotl-test-${Date.now()}`;
  let persisted;
  regulator.setAdaptivePersister({ persistMap: async (scope, key, map) => { persisted = { scope, key, map: new Map(map) }; } });
  assert.equal((await regulator.requestChange({ id, to: 'STABLE', reason: 'direct skip' })).reason, 'transition_not_allowed');
  const differentiating = await regulator.requestChange({ id, to: 'DIFFERENTIATING', reason: 'validated structural need' });
  assert.equal(differentiating.ok, true);
  assert.equal(differentiating.state.history[0].reason, 'validated structural need');
  assert.equal((await regulator.requestChange({ id, to: 'STABLE', reason: 'skip consolidation' })).reason, 'transition_not_allowed');
  assert.equal(persisted.scope, 'axolotl_plasticity');
  assert.equal(persisted.map.get(id).state, 'DIFFERENTIATING');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
