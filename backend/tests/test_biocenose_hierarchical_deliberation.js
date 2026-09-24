'use strict';

const assert = require('node:assert/strict');
const { aggregateHierarchicalDeliberation } = require('../src/services/biocenoseService');

const result = aggregateHierarchicalDeliberation({
  clusters: [
    { clusterId: 'north', outcome: 'A', distribution: [{ position: 'A', share: 0.51 }, { position: 'B', share: 0.49, memberCount: 49 }] },
    { clusterId: 'south', outcome: 'B', distribution: [{ position: 'B', share: 0.7 }] },
    { clusterId: 'west', outcome: 'A', distribution: [{ position: 'A', share: 0.6 }], dissent: [
      { dissentId: 'd1', critical: true, receipt: { receiptId: 'r1', evidenceRef: 'proof' } }
    ] }
  ],
  isTrustedReceipt: (receipt) => receipt.receiptId === 'r1'
});

assert.equal(result.status, 'PLURALISM_RETAINED');
assert.deepEqual(result.clusters[0].distribution.map((item) => item.share), [0.51, 0.49]);
assert.equal(result.parentMustReview, true);
assert.equal(result.minorityEvidenceBypass[0].receiptId, 'r1');

process.stdout.write('Biocenose hierarchical deliberation checks: PASS\n');
