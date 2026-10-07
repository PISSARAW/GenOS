'use strict';
const assert = require('node:assert/strict');
const phi = require('../src/services/iitPhiService');
async function main() {
  const input = { state: [0, 0], tpm: [[0, 0], [1, 0], [0, 1], [1, 1]],
    tpmKind: 'interventional', conditionalIndependence: true, protocolHash: 'a'.repeat(64) };
  await assert.rejects(phi.compute({ ...input, tpmKind: 'observational' }), /Interventional/);
  await assert.rejects(phi.compute({ ...input, state: [0, 0, 0, 0, 0] }), /1-4/);
  const missing = await phi.compute(input, { pythonPath: '__nonexistent_phi_python__' });
  assert.equal(missing.status, 'not_run');
  assert.equal(missing.phi, null);
  const result = await phi.compute(input, { pythonPath: process.env.GENOS_PYTHON || 'python' });
  assert.equal(result.promotionAllowed, false);
  assert.equal(result.modelHash.length, 64);
  if (result.status === 'computed') {
    assert.equal(result.theory, 'IIT-3.0');
    assert.equal(result.engine, 'pyphi@1.2.0');
    assert.ok(Number.isFinite(result.phi));
  } else {
    assert.equal(result.phi, null);
    assert.ok(result.reason);
  }
  console.log('Phi adapter boundary passed; engine status=' + result.status + ', reason=' + (result.reason || 'none'));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
