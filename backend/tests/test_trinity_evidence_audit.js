'use strict';

// ADR 0281: fabricated evidence must weigh zero; executed tests need receipts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const audit = require('../src/services/trinityEvidenceAudit');
const trinity = require('../src/services/trinityService');

function testPlaceholdersWeighZero() {
  const ids = new Set();
  for (const ref of ['evidence1', 'evidence2', '<source-ref>', 'https://example.com/ref1', 'README', 'docs', 'N2_erreur_logique', 'GENOS_MEMORY_CONTEXT', '', '   ']) {
    assert.equal(audit.refWeight(ref, ids), 0, `placeholder must weigh zero: ${ref}`);
  }
}

function testSelfCitationsWeighZero() {
  const ids = new Set();
  assert.equal(audit.refWeight('Task: Trinity mission: cold start analysis', ids), 0);
  assert.equal(audit.refWeight('mission_prompt:N2 — raisonnement', ids), 0);
}

function testResolvableWeighs() {
  const ids = new Set(['e-low']);
  assert.equal(audit.refWeight('e-low', ids), 2);
  assert.equal(audit.refWeight('https://nodejs.org/api/assert', ids), 1);
  assert.equal(audit.refWeight('backend/src/services/trinityService.js', ids), 1);
}

function testReceiptedTests() {
  const withReceipts = { tests: [{ name: 't', passed: true, receipt: 'r' }, { name: 'u', passed: true, commandId: 'c' }] };
  assert.equal(trinity.scoreWorldEvidence(withReceipts, 'software_engineering').testsCoverage, 1.0);
  const declared = { tests: ['suite ok', 'vérifié'] };
  assert.equal(trinity.scoreWorldEvidence(declared, 'software_engineering').testsCoverage, 0);
  const failed = { tests: [{ name: 't', failed: true, receipt: 'r' }] };
  assert.equal(trinity.scoreWorldEvidence(failed, 'software_engineering').testsCoverage, 0);
}

function testMatrixExplains() {
  const comparison = trinity.compareWorlds([
    { worldNumber: 1, role: 'w1', report: { outcome: 'success', claims: [{ statement: 'A long enough substantive statement here', evidence: ['evidence1'] }] } },
    { worldNumber: 2, role: 'w2', report: { outcome: 'success', claims: [] } }
  ], 'software_engineering');
  const weak = comparison.comparisonMatrix.find((m) => m.worldNumber === 1);
  assert.ok(weak.weaknesses.some((w) => /unresolvable/.test(w)), 'matrix must name the fabrication');
}

function testRealDossiersReplay() {
  const dumpPath = path.resolve(__dirname, '../../artifacts/trinity-missions/real-ALL-evidence.json');
  if (!fs.existsSync(dumpPath)) {
    console.log('(skip) real dossiers dump absent');
    return;
  }
  const worlds = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  assert.ok(worlds.length >= 18, 'expected at least 18 real worlds');
  let overThreshold = 0;
  let placeholderOnlyProven = 0;
  let placeholderOnlyCount = 0;
  let namedFabrication = 0;
  for (const world of worlds) {
    const report = { claims: world.claims || [], tests: [], uncertainties: [] };
    const scored = trinity.scoreWorldEvidence(report, 'software_engineering');
    if (scored.totalScore >= 0.70) overThreshold += 1;
    if (scored.evidenceAudit.placeholderRefs > 0) namedFabrication += 1;
    const reframed = audit.auditReport(report);
    if (reframed.resolvableRefs === 0) {
      placeholderOnlyCount += 1;
      placeholderOnlyProven += reframed.proven;
    }
  }
  assert.equal(overThreshold, 0, 'no fabricated dossier may pass the merge threshold');
  assert.ok(placeholderOnlyCount > 0, 'expected placeholder-only dossiers in the replay');
  assert.equal(placeholderOnlyProven, 0, 'placeholder-only dossiers must prove nothing');
  assert.ok(namedFabrication > 0, 'fabrication must be detected and named');
}

function testGoodDossierScores() {
  const report = {
    outcome: 'success',
    evidence: [{ id: 'e1' }, { id: 'e2' }],
    claims: [
      { statement: 'Cold start dominates the first call latency budget', evidence: ['e1'] },
      { statement: 'SQL cost is excluded by the measured 15 ms span', evidence: ['backend/src/db/index.js'] }
    ],
    tests: [{ name: 'pool-eviction probe', passed: true, receipt: 'sha256:abc' }]
  };
  const scored = trinity.scoreWorldEvidence(report, 'software_engineering');
  assert.equal(scored.claimsScore, 1.0);
  assert.equal(scored.provenClaims, 2);
  assert.ok(scored.totalScore > 0.5, 'real evidence must score high');
}

async function main() {
  testPlaceholdersWeighZero();
  testSelfCitationsWeighZero();
  testResolvableWeighs();
  testReceiptedTests();
  testMatrixExplains();
  testRealDossiersReplay();
  testGoodDossierScores();
  console.log('✅ Trinity evidence audit tests passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
