'use strict';

const assert = require('node:assert');
const S = require('../src/services/epistemic/stigmergyInterProcessBridge');

// ---- types supportés ----

assert.ok(S.isSupportedType(S.SIGNAL_TYPES.EPISTEMIC_CONTRADICTION));
assert.ok(S.isSupportedType(S.SIGNAL_TYPES.EPISTEMIC_VERIFIER_SUCCESS));
assert.ok(S.isSupportedType(S.SIGNAL_TYPES.EPISTEMIC_VERIFIER_FAILURE));
assert.ok(S.isSupportedType(S.SIGNAL_TYPES.EPISTEMIC_DOMAIN_GAP));
assert.ok(S.isSupportedType(S.SIGNAL_TYPES.EPISTEMIC_KNOWN_FAILURE));
assert.ok(S.isSupportedType(S.SIGNAL_TYPES.EPISTEMIC_HIGH_RISK));
assert.ok(!S.isSupportedType('unknown'));

// ---- dépôt de phéromone ----

async function run() {
  const signal = {
    type: S.SIGNAL_TYPES.EPISTEMIC_CONTRADICTION,
    payload: { claimId: 'C17' },
    locus: 'auth',
    locusHash: 'auth-hash',
    intensity: 0.82,
    isRepellent: false,
  };

  const result = await S.depositPheromone(signal);
  assert.strictEqual(result.signalType, 'pheromone');
  assert.ok(result.signalBlob);
  assert.ok(result.depositedAt);

  // Type non supporté.
  await assert.rejects(
    () => S.depositPheromone({ type: 'unknown', payload: {} }),
    /Unsupported pheromone type: unknown/
  );
}

run().then(() => console.log('OK stigmergyInterProcessBridge')).catch((err) => {
  console.error(err);
  process.exit(1);
});
