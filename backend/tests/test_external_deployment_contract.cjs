'use strict';

const assert = require('node:assert/strict');
const { CONTRACT, MANIFEST, report, validateReceipt } = require('../../scripts/ci/check_external_deployment_contract.cjs');

assert.ok(MANIFEST.endsWith('morphogenesis-parity.yaml'));
const absent = validateReceipt(null);
assert.equal(absent.valid, false);
assert.deepEqual(absent.missing, ['operator receipt']);
const valid = validateReceipt({ target: 'kind', runId: 'run-1', contract: CONTRACT, healthChecks: true, parityDigest: 'a'.repeat(64), restartObserved: true });
assert.equal(valid.valid, true);
const invalid = validateReceipt({ target: 'cloud', runId: 'run-2', contract: CONTRACT, healthChecks: true, parityDigest: 'not-a-digest', restartObserved: false });
assert.equal(invalid.valid, false);
const result = report();
assert.equal(result.contract, CONTRACT);
assert.equal(result.claimable, false);
assert.equal(result.status, 'not_observed');
assert.match(result.applyCommand, /kubectl apply/);
console.log(`External deployment contract (${result.status}): PASS`);
