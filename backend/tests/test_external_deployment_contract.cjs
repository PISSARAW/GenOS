'use strict';

const assert = require('node:assert/strict');
const { CONTRACT, MANIFEST, RECEIPT_SCHEMA, report, validateReceipt } = require('../../scripts/ci/check_external_deployment_contract.cjs');

assert.ok(MANIFEST.endsWith('morphogenesis-parity.yaml'));
const absent = validateReceipt(null);
assert.equal(absent.valid, false);
assert.deepEqual(absent.missing, ['operator receipt']);
const valid = validateReceipt({
  schemaVersion: RECEIPT_SCHEMA, target: 'kubernetes', runId: 'run-1', contract: CONTRACT,
  context: 'kind-genos', namespace: 'genos-morphogenesis-parity', imageDigest: `sha256:${'a'.repeat(64)}`,
  podIdentities: [1, 2, 3].map((id) => ({ name: `genos-${id}`, uid: `uid-${id}`, ready: true })),
  healthChecks: [{ path: '/readyz', status: 200, observedAt: '2026-10-17T00:00:00Z' }, { path: '/healthz', status: 200, observedAt: '2026-10-17T00:00:01Z' }],
  parityDigest: 'b'.repeat(64), restartObserved: { beforePodUid: 'uid-old', afterPodUid: 'uid-new', recoveredDigest: 'b'.repeat(64) },
  evidenceRefs: ['logs/run-1.json']
});
assert.equal(valid.valid, true);
const invalid = validateReceipt({ schemaVersion: RECEIPT_SCHEMA, target: 'cloud', runId: 'run-2', contract: CONTRACT, context: 'cloud', namespace: 'genos', imageDigest: 'not-a-digest', podIdentities: [], healthChecks: [], parityDigest: 'not-a-digest', restartObserved: false, evidenceRefs: [] });
assert.equal(invalid.valid, false);
const result = report();
assert.equal(result.contract, CONTRACT);
assert.equal(result.claimable, false);
assert.equal(result.status, 'not_observed');
assert.match(result.applyCommand, /kubectl apply/);
console.log(`External deployment contract (${result.status}): PASS`);
