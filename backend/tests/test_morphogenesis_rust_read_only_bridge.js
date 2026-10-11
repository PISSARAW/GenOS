'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { adjudicatePostMission } = require('../src/services/morphogenesis/runtime/morphogenesisRustReadOnlyBridge');

function response(payload, decision = 'NO_CHANGE') {
  return {
    schemaVersion: 1,
    requestSha256: crypto.createHash('sha256').update(payload).digest('hex'),
    decision, commitAuthorized: false, committed: false,
    plan: { decision_no_change: decision === 'NO_CHANGE' },
    governance: { allowed: decision === 'NO_CHANGE', reason: 'read-only' }
  };
}

async function main() {
  const morphology = { topology: 'trinity', variantId: 'controlled' };
  const runner = async (args) => {
    assert.equal(args[0], 'morphogenesis-adjudicate');
    const request = JSON.parse(args[1]);
    assert.equal(request.currentTopology, 'trinity');
    assert.equal(request.variantId, 'controlled');
    assert.equal(request.missionId, 'mission-1');
    assert.deepEqual(request.proposals, []);
    return { ok: true, json: response(args[1]) };
  };
  const result = await adjudicatePostMission(morphology, { missionId: 'mission-1', runner });
  assert.equal(result.available, true);
  assert.equal(result.decision, 'NO_CHANGE');
  assert.equal(result.committed, false);

  const unavailable = await adjudicatePostMission(morphology, {
    runner: async () => ({ ok: false, code: 'BIN_NOT_FOUND' })
  });
  assert.equal(unavailable.decision, 'UNAVAILABLE');
  assert.equal(unavailable.available, false);
  await assert.rejects(adjudicatePostMission(morphology, {
    runner: async () => ({ ok: true, json: { ...response('wrong'), decision: 'APPLIED' } })
  }), /Invalid or unbound/);
  await assert.rejects(adjudicatePostMission(morphology, {
    runner: async (args) => ({ ok: true, json: { ...response(args[1]), committed: true } })
  }), /Invalid or unbound/);
  if (process.env.GENOS_MORPHO_E2E === '1') {
    const real = await adjudicatePostMission(morphology, { missionId: 'mission-1' });
    assert.equal(real.available, true, JSON.stringify(real));
    assert.equal(real.decision, 'NO_CHANGE');
    assert.equal(real.plan.decision_no_change, true);
  }
  console.log('Morphogenesis Rust read-only bridge contract: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
