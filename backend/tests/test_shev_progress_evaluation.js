'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const ledger = require('../src/services/gvxDevelopmentLedger');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { recordObservation } = require('../src/services/shev/observationService');
const { compilePending } = require('../src/services/shev/initiativeService');
const { recordAgentProgress } = require('../src/services/shev/agentProgressService');
const { calibrateEvaluator, recordQualitativeJudgment,
  qualitativeDisagreement } = require('../src/services/shev/qualitativeService');
const { recordLongitudinalComparison } = require('../src/services/shev/longitudinalService');

const projectId = 'shev-evaluation';
const hash = (letter) => letter.repeat(64);

async function setup(db) {
  await store.createProject(db, { id: projectId, rootPath: 'C:/test', branch: 'codex/test',
    objective: 'Tester le transfert', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId, authorityRef: 'owner:test',
    mandate: { purpose: 'Tester le transfert', autoDiagnose: false, autoInstrument: false,
      dimensions: [{ name: 'quality', expected: 'Qualite durable', acceptance: ['Cas nouveaux passes.'] }] } });
  await recordObservation(db, { id: 'gap', projectId, domain: 'application-contract',
    dimension: 'quality', kind: 'capability_gap', epistemicStatus: 'observed',
    source: 'independent-review', observedAt: new Date(Date.now() - 10000).toISOString(),
    summary: 'Lacune recurrente', evidenceRefs: ['artifact:gap'] });
  await compilePending(db, { projectId });
  return db.get("SELECT * FROM shev_initiatives WHERE observation_id = 'gap'");
}

async function testProgress(db, initiative) {
  const transfer = { contextHash: hash('a'), state: 'monitored',
    trialEvidence: [{ contextHash: hash('a') }],
    monitoring: { windows: [{ contextHash: hash('b'), artifactHash: hash('d') },
      { contextHash: hash('c'), artifactHash: hash('e') }] },
    verifiedEvidence: [{ verified: true, artifactHash: hash('d') },
      { verified: true, artifactHash: hash('e') }] };
  const event = await ledger.appendEvent(db, { id: 'gvx-heldout-1', organizationId: 'org-test',
    projectId, entityId: 'agent-test', type: 'transfer_recorded', payload: { transfer } });
  const input = { organizationId: 'org-test', projectId, entityId: 'agent-test',
    initiativeId: initiative.id, gvxEventId: event.id,
    verify: async () => ({ verifierRef: 'independent-transfer-verifier', cases: [
      { contextHash: hash('b'), baseline: 0.4, candidate: 0.7, direction: 'higher',
        regression: false, evidenceRefs: ['artifact:heldout-b'] },
      { contextHash: hash('c'), baseline: 0.5, candidate: 0.8, direction: 'higher',
        regression: false, evidenceRefs: ['artifact:heldout-c'] }] }) };
  const receipt = await recordAgentProgress(db, input);
  assert.equal(receipt.result, 'confirmed');
  assert.equal(JSON.parse(receipt.metrics_json).heldoutCount, 2);
  assert.equal((await recordAgentProgress(db, input)).replayed, true);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM shev_effects')).n, 0);
  const bad = { ...transfer, monitoring: { windows: [
    { contextHash: hash('a'), artifactHash: hash('d') },
    { contextHash: hash('c'), artifactHash: hash('e') }] } };
  await ledger.appendEvent(db, { id: 'gvx-heldout-bad', organizationId: 'org-test',
    projectId, entityId: 'agent-test', type: 'transfer_recorded', payload: { transfer: bad } });
  await assert.rejects(recordAgentProgress(db, { ...input, gvxEventId: 'gvx-heldout-bad' }), /held-out/);
}

async function testQualitative(db) {
  await recordObservation(db, { id: 'visual-check', projectId, domain: 'application-contract',
    dimension: 'quality', kind: 'state', epistemicStatus: 'observed',
    source: 'review-panel', observedAt: new Date().toISOString(), summary: 'Evaluation utilisateur',
    evidenceRefs: ['artifact:visual'] });
  for (const [evaluatorId, observedScore] of [['reviewer-a', 1], ['reviewer-b', 4]]) {
    const references = [0, 1, 2].map((score) => ({ id: `reference-${score}`,
      referenceScore: score, evaluatorScore: score, evidenceRef: `artifact:reference-${score}` }));
    const calibration = await calibrateEvaluator(db, { projectId, evaluatorId,
      rubricVersion: 'rubric-v1', references,
      verifyReferences: async () => ({ verified: true, verifierRef: 'reference-panel',
        evidenceRefs: references.map((item) => item.evidenceRef) }) });
    await recordQualitativeJudgment(db, { id: `judgment-${evaluatorId}`, projectId,
      observationId: 'visual-check', calibrationId: calibration.id, evaluatorId,
      audience: 'clients', score: observedScore, rationale: 'Lecture de la grille',
      evidenceRefs: ['artifact:visual'] });
  }
  const disagreement = await qualitativeDisagreement(db, { projectId,
    observationId: 'visual-check', rubricVersion: 'rubric-v1' });
  assert.equal(disagreement.disputed, true);
  assert.equal(disagreement.spread, 3);
  assert.equal(disagreement.judgments.length, 2);
  await assert.rejects(db.run("UPDATE shev_qualitative_judgments SET score = 2 WHERE id = 'judgment-reviewer-a'"),
    /immutable/);
}

async function testLongitudinal(db, initiative) {
  const periods = ['week-1', 'week-2', 'week-3', 'week-4'];
  const treated = [];
  for (const [index, period] of periods.entries()) {
    const id = `monitor-${index}`;
    const result = index === 2 ? 'regressed' : 'confirmed';
    await db.run(`INSERT INTO shev_monitoring
      (id, initiative_id, observation_id, result, verifier_ref, evidence_json)
      VALUES (?, ?, ?, ?, ?, ?)`, [id, initiative.id, `observation-${index}`,
      result, 'independent-monitor', '["artifact:monitor"]']);
    treated.push({ period, monitoringId: id, exposure: 100, regressions: Number(result === 'regressed'),
      recoveryMinutes: index === 2 ? 20 : 0, costUsd: 2, evidenceRefs: [`artifact:${id}`] });
  }
  const reference = (id, regressions) => ({ id, protocolRef: `protocol:${id}`,
    series: periods.map((period) => ({ period, exposure: 100, regressions,
      recoveryMinutes: 30, costUsd: 3, evidenceRefs: [`artifact:${id}:${period}`] })) });
  const input = { id: 'comparison-1', projectId,
    dimension: 'quality', preRegistrationRef: 'protocol:preregistered-v1',
    preRegistrationAt: new Date(Date.now() - 86400000).toISOString(), treated,
    references: [reference('human-review', 1), reference('standard-agent', 2)],
    confounders: ['La charge projet peut differer entre groupes.'],
    verifyReferences: async () => ({ verified: true, verifierRef: 'external-study-auditor',
      evidenceRefs: ['artifact:human-study', 'artifact:agent-study'] }) };
  await assert.rejects(recordLongitudinalComparison(db, { ...input,
    verifyReferences: async () => ({ verified: false }) }), /independent verification/);
  const comparison = await recordLongitudinalComparison(db, input);
  assert.equal(comparison.result.treated.regressionsPerExposure, 1 / 400);
  assert.equal(comparison.result.references.length, 2);
  assert.equal(comparison.result.causalClaim, false);
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    const initiative = await setup(db);
    await testProgress(db, initiative);
    await testQualitative(db);
    await testLongitudinal(db, initiative);
    console.log('SHEV transfer, calibration and longitudinal comparison passed.');
  } finally { await db.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
