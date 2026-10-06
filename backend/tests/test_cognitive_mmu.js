'use strict';

const assert = require('node:assert/strict');
const { createLedger } = require('../src/services/cognitiveVisibilityLedger');
const { createWorkingSet } = require('../src/services/cognitiveWorkingSetService');
const { createMmu } = require('../src/services/cognitiveMmuService');

const ledger = createLedger();
const workingSet = createWorkingSet({ capacity: 2 });
const mmu = createMmu({ workingSet, ledger, sessionId: 's1',
  authorize: ({ objectId }) => objectId !== 'secret', prefetchThreshold: 0.1,
  resolvers: { repo: async () => ({ value: { file: 'auth.js' }, bytes: 120, tokens: 30 }) } });

(async () => {
  const loaded = await mmu.need({ sessionId: 's1', objectId: 'f1', reference: 'repo', scope: 'audit' });
  assert.equal(loaded.status, 'page_in');
  assert.equal((await ledger.visible({ sessionId: 's1', objectId: 'f1', scope: 'audit' })).visible, true);
  assert.equal(mmu.metrics().pageFaults, 1);
  assert.equal((await mmu.need({ sessionId: 's1', objectId: 'f1', reference: 'repo', scope: 'audit' })).source, 'working_set');
  assert.equal((await mmu.need({ sessionId: 's1', objectId: 'secret', reference: 'repo' })).reason, 'mmu_permission_denied');
  const prefetched = await mmu.prefetch([
    { sessionId: 's1', objectId: 'f2', reference: 'repo', probability: 0.8, valueOfInformation: 2, estimatedTokens: 4 },
    { sessionId: 's1', objectId: 'f3', reference: 'repo', probability: 0.01, valueOfInformation: 1, estimatedTokens: 100 }
  ]);
  assert.deepEqual(prefetched.selected, ['f2']);
  assert.deepEqual(prefetched.skipped, ['f3']);
  assert.equal(mmu.metrics().prefetched, 1);
  assert.equal(mmu.metrics().cost.tokens > 0, true);
  console.log('Cognitive MMU checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
