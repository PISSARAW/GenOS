'use strict';
const assert = require('node:assert/strict');
const { digest } = require('../src/services/trinityProvenanceValues');
const { assertSnapshot } = require('../src/services/localCodeReviewSnapshot');
const files = [{ path: 'answer.py', hash: 'candidate-hash' }];
const source = { sourceWorkerId: 'producer', sourceRunId: 'producer-run', sourceReceiptHash: 'receipt',
  reviewerId: 'reviewer', missionId: 'mission', files };
const snapshot = { ...source, hash: digest(source), receiptRef: 'genos://delegated-review/fixture' };
const mission = { agentId: 'reviewer', missionId: 'mission', delegatedReviewSnapshot: snapshot };
assert.equal(assertSnapshot(mission, files).sourceRunId, 'producer-run');
assert.throws(() => assertSnapshot({ ...mission, agentId: 'other' }, files), { code: 'DELEGATION_REVIEW_SNAPSHOT_INVALID' });
assert.throws(() => assertSnapshot({ ...mission, missionId: 'other' }, files), { code: 'DELEGATION_REVIEW_SNAPSHOT_INVALID' });
assert.throws(() => assertSnapshot(mission, [{ path: 'answer.py', hash: 'changed' }]), { code: 'DELEGATION_REVIEW_SNAPSHOT_INVALID' });
assert.throws(() => assertSnapshot({ ...mission, delegatedReviewSnapshot: { ...snapshot, sourceRunId: 'forged' } }, files), { code: 'DELEGATION_REVIEW_SNAPSHOT_INVALID' });
assert.throws(() => assertSnapshot({ ...mission, delegatedReviewSnapshot: null }, files), { code: 'DELEGATION_REVIEW_SNAPSHOT_INVALID' });
console.log('Read-only review remains bound to the tested candidate snapshot: PASS');
