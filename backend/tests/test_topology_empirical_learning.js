'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const policyFile = path.join(os.tmpdir(), `genos-topology-policy-${process.pid}.json`);
process.env.GENOS_MORPHOLOGY_POLICY_PATH = policyFile;
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'morphology-policy-test-secret';
const learning = require('../src/services/morphogenesis/morphologyLearningService');
const { compareTopologies } = require('../src/services/morphogenesis/topologyResolverService');

function evidenceFor(receiptId) {
  const fields = { success: true, value: 1, kind: 'benchmark' };
  const evidenceDigest = crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  const verifierDigest = require('../src/services/verifierTrustRegistry').listVerifierDigests()[0];
  const receipt = require('../src/services/epistemicVerifierReceiptService').issueReceipt({
    resultId: receiptId, evidenceDigest, verifierDigest, independent: true, status: 'verified'
  });
  return { status: 'VERIFIED', ...fields, receiptId, receipt };
}

const features = { problemType: 'controlled-test', complexity: 0.5 };
const initial = compareTopologies({ problemProfile: features })[0].topology;
for (let index = 0; index < 40; index += 1) {
  learning.recordExperience({
    problemFeatures: features,
    morphology: { topology: 'metapopulation' },
    outcome: { success: true, quality: 1 },
    outcomeEvidence: evidenceFor(`controlled:${index}`)
  });
}
const ranking = compareTopologies({ problemProfile: features });
assert.notEqual(initial, 'metapopulation');
assert.equal(ranking[0].topology, 'metapopulation');
assert.equal(ranking[0].learnedSamples, 40);
assert.ok(ranking[0].learnedWeight > 0.8);
const savedPolicy = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
assert.equal(savedPolicy.observations.length, 40);
savedPolicy.observations[0].score = 0;
fs.writeFileSync(policyFile, JSON.stringify(savedPolicy));
const policyModule = require.resolve('../src/services/morphogenesis/learning/topologyPolicyService');
delete require.cache[policyModule];
assert.equal(require('../src/services/morphogenesis/learning/topologyPolicyService').getStatus().observations, 39);
fs.rmSync(policyFile, { force: true });
delete process.env.GENOS_MORPHOLOGY_POLICY_PATH;
delete process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
console.log('Verified morphology outcomes move resolver rankings as prior influence decays.');
