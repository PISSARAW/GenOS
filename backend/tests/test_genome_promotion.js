'use strict';

const assert = require('node:assert/strict');
const promotion = require('../src/services/genomePromotionService');

function makeOrganism() {
  return {
    metadata: { id: 'org-1' },
    policy: {},
    metrics: { success: 0.7, robustness: 0.6, evidence: 0.6, generalization: 0.4, cost: 0.2, risk: 0.1, complexity: 0.2 },
    structure: { nodes: [1, 2, 3] },
    immune: { rejected: false, findings: [] }
  };
}

function makeCandidate() {
  return {
    metadata: { id: 'cand-1', parentId: 'org-1' },
    policy: {},
    metrics: { success: 0.8, robustness: 0.7, evidence: 0.7, generalization: 0.5, cost: 0.2, risk: 0.1, complexity: 0.2 },
    structure: { nodes: [1, 2, 3, 4] },
    immune: { rejected: false, findings: [] }
  };
}

function verifyPromotionDeploys() {
  const result = promotion.promoteCandidate(makeOrganism(), makeCandidate());
  assert.equal(result.gate.promoted, true);
  assert.equal(result.receipt.result, 'PROMOTED');
  assert.equal(result.deployment.deployed, true);
  assert.equal(result.deployment.genome.metadata.id, 'cand-1');
  assert.ok(result.fitnessAfter.score >= result.fitnessBefore.score);
}

function verifyRegressionBlocks() {
  const organism = makeOrganism();
  const regressed = { ...makeCandidate(), metrics: { ...makeCandidate().metrics, success: 0.1, evidence: 0.0 } };
  const result = promotion.promoteCandidate(organism, regressed);
  assert.equal(result.gate.promoted, false);
  assert.equal(result.receipt.result, 'REJECTED');
  assert.equal(result.deployment.deployed, false);
  assert.equal(result.deployment.genome.metadata.id, 'org-1');
  assert.ok(result.deployment.blockedBy.length > 0);
}

function verifyImmuneBlocks() {
  const organism = makeOrganism();
  const infected = { ...makeCandidate(), immune: { rejected: true, findings: ['foreign-code'] } };
  const result = promotion.promoteCandidate(organism, infected);
  assert.equal(result.gate.promoted, false);
  assert.ok(result.deployment.blockedBy.includes('immune'));
}

verifyPromotionDeploys();
verifyRegressionBlocks();
verifyImmuneBlocks();
console.log('Genome promotion tests passed.');
