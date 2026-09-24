'use strict';

const assert = require('node:assert/strict');
const { createSyncytiumCrdt } = require('../src/services/syncytiumCrdtService');
const relations = require('../src/services/syncytium/causality/causalRelationService');

function main() {
  const runtime = createSyncytiumCrdt();
  runtime.applyOp({ opId: 'a1', actorId: 'A', kind: { type: 'set_field', key: 'x', value: 1 } });
  const first = runtime.getHistory()[0];
  assert.deepEqual(first.dot, { actorId: 'A', sequence: 1 });
  assert.deepEqual(first.causalContext, {});
  assert.deepEqual(first.versionVector, { A: 1 });
  assert.deepEqual(runtime.getSnapshot(null, 1).causalFrontier, { A: 1 });

  runtime.applyOp({ opId: 'b1', actorId: 'B', kind: { type: 'set_field', key: 'y', value: 2 } });
  const independent = runtime.getHistory()[1];
  assert.deepEqual(independent.causalContext, { A: 1 });
  assert.equal(relations.happenedBefore(first, independent), true);

  const concurrentA = {
    actorId: 'A', dot: { actorId: 'A', sequence: 2 }, causalContext: { A: 1 },
    versionVector: { A: 2 }
  };
  const concurrentB = {
    actorId: 'B', dot: { actorId: 'B', sequence: 2 }, causalContext: { A: 1, B: 1 },
    versionVector: { A: 1, B: 2 }
  };
  assert.equal(relations.concurrent(concurrentA, concurrentB), true);
  assert.equal(relations.relation(first, first), 'EQUAL');

  assert.throws(() => runtime.applyOp({
    opId: 'bad-dot', actorId: 'A', dot: { actorId: 'B', sequence: 9 },
    kind: { type: 'set_field', key: 'z', value: 3 }
  }), (error) => error.code === 'SYNCYTIUM_CAUSAL_DOT_INVALID');
  assert.equal(runtime.hasOpId('bad-dot'), false);

  const restored = createSyncytiumCrdt();
  runtime.getHistory().forEach((operation) => restored.applyOp(operation));
  assert.deepEqual(restored.getCausalFrontier(), runtime.getCausalFrontier());
  assert.deepEqual(restored.getSnapshot().sharedFields, runtime.getSnapshot().sharedFields);
}

main();
console.log('Syncytium causality checks: PASS');
