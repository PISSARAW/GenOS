'use strict';

const { randomUUID } = require('node:crypto');
const { exampleIsolationProof, verifiedEvidence } = require('./isolation-proof.cjs');

const numbers = [17, 4, 9];
function execution(context = {}) {
  const output = { result: { sum: numbers.reduce((total, number) => total + number, 0) },
    receiptId: randomUUID(), resourcesConsumed: { tokens: 1 },
    contributionScore: 1, contractCompliant: true, benefitScore: 1,
    evidenceQuality: 1, costScore: 0.1, riskScore: 0 };
  if (context.adapterProvenance) output.isolationProof =
    exampleIsolationProof(context.adapterProvenance, 'arithmetic-trial-example');
  return output;
}

function verifyCapability({ result, resultHash, output }) {
  let expected = 0;
  for (const number of numbers) expected += number;
  return { status: result.sum === expected ? 'VERIFIED' : 'REJECTED',
    resultHash, verifierId: 'arithmetic-independent-verifier',
    evidenceRefs: verifiedEvidence(output, [`arithmetic-proof:${resultHash}`]) };
}

function createMissionInput() {
  return { hostId: 'arithmetic-host', missionId: randomUUID(), capability: 'arithmetic',
    budget: { tokens: 10, latencyMs: 5000, maxSteps: 2 },
    executeCapability: execution, trialCapabilityExecutor: execution, verifyCapability,
    symbionts: [{ id: 'local-calculator', kind: 'tool', contract: {
      capabilitiesOffered: ['arithmetic'], resourcesRequested: { tokens: 10 },
      authorityScope: { level: 'CAPABILITY', actions: ['arithmetic'] },
      evidenceRequirements: ['arithmetic-proof'], expectedBenefit: { accuracy: 'checked sum' },
      maxCost: { tokens: 10 }, terminationConditions: ['mission-end'], dependencyCeiling: 0.3
    } }],
    allocation: { policy: { tokens: { basal: 1, preferred: 2, maximum: 2, burstAllowance: 0 } },
      available: { tokens: 10 } } };
}

module.exports = { createMissionInput };
