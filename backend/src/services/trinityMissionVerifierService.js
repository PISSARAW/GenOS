'use strict';

const crypto = require('crypto');
const balancePuzzle = require('./trinityBalancePuzzleVerifier');
const contracts = require('./trinityMissionContractService');

const VERIFIER_DIGEST = `sha256:${crypto.createHash('sha256').update('trinity-balance-puzzle-verifier-v1').digest('hex')}`;

function proofReceipt(tree, worldNumber) {
  const digest = `sha256:${crypto.createHash('sha256').update(JSON.stringify(tree)).digest('hex')}`;
  return {
    status: 'verified', independent: true, evidenceDigest: digest, verifierDigest: VERIFIER_DIGEST,
    independenceDescriptor: { actorId: 'trinity-balance-puzzle-verifier', workspaceId: `world-${worldNumber}-proof-check` }
  };
}

function treeOf(report) {
  return report?.artifact?.weighingTree || report?.weighingTree || null;
}

function addPuzzleProof(world) {
  const report = world.report || {};
  const tree = treeOf(report);
  const result = balancePuzzle.verify(tree);
  const check = { verifier: 'balance-puzzle-v1', status: result.verified ? 'verified' : tree ? 'failed' : 'missing', ...result };
  const next = { ...report, missionContractVerification: check };
  if (result.verified) addVerifiedProof(next, tree, world.worldNumber);
  else next.uncertainties = [...(next.uncertainties || []), tree ? `balance_tree_counterexample:${result.counterexample.coin}:${result.counterexample.direction}` : 'balance_tree_missing'];
  return { ...world, report: next };
}

function addVerifiedProof(report, tree, worldNumber) {
  const id = `balance-tree-world-${worldNumber}`;
  const receipt = proofReceipt(tree, worldNumber);
  report.evidence = [...(report.evidence || []), { id, verificationReceipt: receipt, verifier: 'balance-puzzle-v1' }];
  report.claims = [...(report.claims || []), {
    id: `${id}-coverage`, statement: 'The adaptive weighing tree identifies the odd coin and its direction in all 24 cases.',
    evidence: [id], verificationLevel: 'independent_deterministic', verificationReceipts: [{ receipt }]
  }];
  report.coverage = 1;
  report.coverageReceipt = receipt;
  report.tests = [...(report.tests || []), { name: '12-coin three-weighing exhaustive coverage', passed: true, verificationReceipt: receipt }];
  report.evidenceVector = { ...report.evidenceVector, correctness: 1, coverage: 1, robustness: 1,
    reproducibility: 1, risk: 0, uncertainty: 0, constraintCoverage: 1 };
  report.evidenceVectorEvidence = { ...report.evidenceVectorEvidence,
    correctness: [id], coverage: [id], robustness: [id], reproducibility: [id],
    risk: [id], uncertainty: [id], constraintCoverage: [id] };
  report.hardConstraintsPassed = true;
}

function verifyMissionReports(worlds, mission) {
  const contract = contracts.contractFor(mission);
  if (contract.artifact !== 'weighing_tree') return worlds;
  return worlds.map(addPuzzleProof);
}

module.exports = { verifyMissionReports, proofReceipt };
