'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const checks = require('../src/services/epistemic/oracleObservationChecks');
const { runScout } = require('../src/services/agents/deterministicWorkerScout');
const { runMonitor } = require('../src/services/agents/deterministicWorkerMonitor');
const { runSynthesis } = require('../src/services/agents/deterministicWorkerSynthesis');
const { runForensic } = require('../src/services/agents/deterministicWorkerForensic');
const { runExperiment } = require('../src/services/agents/deterministicWorkerExperiment');
const { runVerification } = require('../src/services/agents/deterministicWorkerVerifier');
const { runRed } = require('../src/services/agents/deterministicWorkerRed');
const { runTeaching } = require('../src/services/agents/deterministicWorkerTeaching');
const { runHandoff } = require('../src/services/agents/workerCoordinationExecutor');
const { runRecovery } = require('../src/services/agents/workerRecoveryExecutor');

const scoutMethod = { version: 1, methodId: 'scan_literal', parameters: {
  sources: [{ sourceRef: 'fixture://log', text: 'timeout timeout' }], terms: ['timeout', 'missing'] } };
const scoutResult = runScout(scoutMethod);
const scoutSubject = { domain: 'literal_observation', method: scoutMethod, result: scoutResult };
assert.equal(checks.checkObservation(scoutSubject, 'scout_index').status, 'verified');
assert.equal(checks.checkObservation(scoutSubject, 'scout_character_scan').status, 'verified');
assert.equal(checks.checkObservation({ ...scoutSubject, result: { ...scoutResult,
  observations: [{ ...scoutResult.observations[0], offset: 7 }] } }, 'scout_index').status, 'refuted');
assert.equal(checks.checkObservation({ ...scoutSubject, result: { ...scoutResult,
  scoutReceipt: { id: 'forged' } } }, 'scout_index').status, 'refuted');

const monitorMethod = { version: 1, methodId: 'monitor_samples', parameters: {
  territoryId: 'test-sensor', threshold: 10, samples: [
    { value: 9, observedAt: '2026-10-11T10:00:00Z', sourceRef: 'sensor://1' },
    { value: 12, observedAt: '2026-10-11T10:01:00Z', sourceRef: 'sensor://2' }
  ] } };
const monitor = runMonitor(monitorMethod);
const statement = `${monitor.anomalies.length} of ${monitor.sampleCount} samples exceeded ${monitor.threshold}.`;
const monitorSubject = { domain: 'monitor_window', method: monitorMethod, result: {
  claims: [{ statement, evidence: monitor.territoryReport.sourceRefs }],
  territoryReport: monitor.territoryReport, anomalies: monitor.anomalies,
  monitorReceipt: monitor.monitorReceipt
} };
assert.equal(checks.checkObservation(monitorSubject, 'monitor_filter').status, 'verified');
assert.equal(checks.checkObservation(monitorSubject, 'monitor_count').status, 'verified');
assert.equal(checks.checkObservation({ ...monitorSubject, result: { ...monitorSubject.result,
  anomalies: [] } }, 'monitor_filter').status, 'refuted');
assert.equal(checks.checkObservation(scoutSubject, 'monitor_filter').status, 'inconclusive');

const synthesisMethod = { version: 1, methodId: 'synthesize_claims', parameters: { sources: [
  { sourceRef: 'claim://a', claim: 'Safe.', position: 'yes' },
  { sourceRef: 'claim://b', claim: 'Safe.', position: 'no' }
] } };
const synthesis = runSynthesis(synthesisMethod);
const synthesisSubject = { domain: 'claim_synthesis', method: synthesisMethod, result: synthesis };
assert.equal(checks.checkObservation(synthesisSubject, 'synthesis_group_map').status, 'verified');
assert.equal(checks.checkObservation(synthesisSubject, 'synthesis_pairwise').status, 'verified');
assert.equal(checks.checkObservation({ ...synthesisSubject, result: { ...synthesis,
  disagreements: [] } }, 'synthesis_pairwise').status, 'refuted');

const forensicMethod = { version: 1, methodId: 'trace_declared_causes', parameters: { events: [
  { id: 'deploy', occurredAt: '2026-10-11T10:00:00Z', sourceRef: 'incident://deploy' },
  { id: 'alert', occurredAt: '2026-10-11T10:01:00Z', sourceRef: 'incident://alert',
    causedBy: { eventId: 'deploy', receiptRef: 'incident://receipt' } }
] } };
const forensic = runForensic(forensicMethod);
const forensicSubject = { domain: 'declared_causality', method: forensicMethod, result: forensic };
assert.equal(checks.checkObservation(forensicSubject, 'forensic_event_map').status, 'verified');
assert.equal(checks.checkObservation(forensicSubject, 'forensic_parent_scan').status, 'verified');
assert.equal(checks.checkObservation({ ...forensicSubject, result: { ...forensic,
  causalChain: [] } }, 'forensic_event_map').status, 'refuted');

const experimentMethod = { version: 1, methodId: 'measure_lpt', parameters: {
  jobs: [{ id: 'A', duration: 5 }, { id: 'B', duration: 4 }, { id: 'C', duration: 3 }],
  machines: 2, threshold: 7 } };
const experiment = runExperiment(experimentMethod);
const experimentSubject = { domain: 'lpt_experiment', method: experimentMethod, result: experiment };
assert.equal(checks.checkObservation(experimentSubject, 'lpt_greedy_scan').status, 'verified');
assert.equal(checks.checkObservation(experimentSubject, 'lpt_load_replay').status, 'verified');
assert.equal(checks.checkObservation({ ...experimentSubject, result: { ...experiment,
  measurements: [{ ...experiment.measurements[0], value: 6 }] } }, 'lpt_greedy_scan').status, 'refuted');

const procedure = { version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } };
const procedureReceipt = require('../src/services/agents/deterministicWorkerProcedures').runProcedure(procedure).receipt;
const verifyMethod = { version: 1, methodId: 'verify_procedure', parameters: {
  procedure, candidateReceipt: procedureReceipt } };
const verification = runVerification(verifyMethod);
const verifySubject = { domain: 'procedure_verification', method: verifyMethod, result: verification };
assert.equal(checks.checkObservation(verifySubject, 'verify_subset_bitset').status, 'verified');
assert.equal(checks.checkObservation(verifySubject, 'verify_subset_enumeration').status, 'verified');
assert.equal(checks.checkObservation({ ...verifySubject, result: { ...verification, verdict: 'reject' } },
  'verify_subset_bitset').status, 'refuted');

const candidateReceipt = { ...procedureReceipt, result: { found: false } };
const redMethod = { version: 1, methodId: 'falsify_procedure', parameters: { procedure, candidateReceipt } };
const red = runRed(redMethod);
const redSubject = { domain: 'procedure_falsification', method: redMethod, result: red };
assert.equal(checks.checkObservation(redSubject, 'red_subset_bitset').status, 'verified');
assert.equal(checks.checkObservation(redSubject, 'red_subset_enumeration').status, 'verified');
assert.equal(checks.checkObservation({ ...redSubject, result: { ...red, counterexample: null } },
  'red_subset_enumeration').status, 'refuted');

const teachingMethod = { version: 1, methodId: 'teach_subset_sum', parameters: {
  procedure, learnerIndices: [0, 2], prerequisites: ['Integer addition'] } };
const teaching = runTeaching(teachingMethod);
const teachingSubject = { domain: 'subset_sum_teaching', method: teachingMethod, result: teaching };
assert.equal(checks.checkObservation(teachingSubject, 'teaching_subset_bitset').status, 'verified');
assert.equal(checks.checkObservation(teachingSubject, 'teaching_subset_enumeration').status, 'verified');
assert.equal(checks.checkObservation({ ...teachingSubject, result: { ...teaching,
  transferCheck: { ...teaching.transferCheck, learnerSum: 9 } } }, 'teaching_subset_bitset').status, 'refuted');

const handoffMethod = { version: 1, methodId: 'prepare_handoff', parameters: {
  sourceGroup: 'producers', targetGroup: 'reviewers', items: [
    { sourceRef: 'source://brief', summary: 'Review the brief.' },
    { sourceRef: 'source://brief', summary: 'Review the brief again.' },
    { sourceRef: 'receipt://test', summary: 'Check the receipt.' }
  ] } };
const handoff = runHandoff(handoffMethod).evidenceReport.workerArtifact.content;
const handoffSubject = { domain: 'sourced_handoff', method: handoffMethod, result: handoff };
assert.equal(checks.checkObservation(handoffSubject, 'handoff_set_projection').status, 'verified');
assert.equal(checks.checkObservation(handoffSubject, 'handoff_scan_projection').status, 'verified');
assert.equal(checks.checkObservation({ ...handoffSubject, result: { ...handoff,
  handoff: { ...handoff.handoff, recipientAcknowledged: true } } }, 'handoff_scan_projection').status, 'refuted');

async function checkRecoveryOracles() {
const recoveryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-observation-recovery-'));
const recoveryHash = value => createHash('sha256').update(value).digest('hex');
try {
  fs.writeFileSync(path.join(recoveryRoot, 'state.txt'), 'damaged');
  const recoveryMethod = { version: 1, methodId: 'restore_checkpoint', parameters: {
    path: 'state.txt', content: 'checkpoint', checkpointDigest: recoveryHash('checkpoint'),
    expectedCurrentDigest: recoveryHash('damaged')
  } };
  const mission = { agentId: 'oracle-recovery', workspaceRoot: recoveryRoot, workerContract: {
    authority: { execute: true }, mission: { scope: recoveryRoot,
      recoveryLease: { action: 'restore_checkpoint', path: 'state.txt' } }
  } };
  const recovery = await runRecovery(recoveryMethod, { mission, deadline: Date.now() + 10000 });
  const recoveryResult = recovery.evidenceReport.workerArtifact.content;
  const recoverySubject = { domain: 'checkpoint_recovery', method: recoveryMethod,
    result: recoveryResult, workspaceRoot: recoveryRoot };
  assert.equal(checks.checkObservation(recoverySubject, 'recovery_state_digest').status, 'verified');
  assert.equal(checks.checkObservation(recoverySubject, 'recovery_receipt_replay').status, 'verified');
  fs.writeFileSync(path.join(recoveryRoot, 'state.txt'), 'tampered');
  assert.equal(checks.checkObservation(recoverySubject, 'recovery_state_digest').status, 'refuted');
} finally { fs.rmSync(recoveryRoot, { recursive: true, force: true }); }
}

async function checkCoordinationOracles() {
  const dispatch = require('../src/services/agents/subOrchestratorDispatchService');
  const original = dispatch.dispatchSubOrchestratorWorker;
  const childMethods = [
    { workerKind: 'bounded_worker', mission: 'Solve the scoped subset sum.', methodContract: {
      version: 1, methodId: 'scoped_procedure', parameters: { procedure } } },
    { workerKind: 'scout_cell', mission: 'Find a literal in the sealed source.', methodContract: {
      version: 1, methodId: 'scan_literal', parameters: { sources: [{ sourceRef: 'src://one', text: 'target' }], terms: ['target'] } } }
  ];
  const method = { version: 1, methodId: 'coordinate_children', parameters: { children: childMethods } };
  try {
    dispatch.dispatchSubOrchestratorWorker = async (_db, _parentId, child) => ({ success: true,
      childAgentId: `child-${child.workerKind}`, supervision: { success: true, evidenceReport: {
        workerArtifact: { provenance: { sourceRefs: [`receipt://${child.workerKind}`] } }
      } } });
    const report = await require('../src/services/agents/workerCoordinationExecutor').runCoordination(method, {
      db: {}, mission: { agentId: 'sub-parent' }, deadline: Date.now() + 10000
    });
    const content = report.evidenceReport.workerArtifact.content;
    const coordinationEvidence = { parentId: 'sub-parent', missionId: 'mission-current', children:
      content.childSummaries.map((summary, index) => ({ expected: childMethods[index], summary,
        agentParentId: 'sub-parent', parentWorkerId: 'sub-parent', parentId: 'sub-parent',
        missionId: 'mission-current', parentMissionId: 'mission-current', workerKind: childMethods[index].workerKind,
        methodContract: childMethods[index].methodContract,
        requiredArtifact: index === 0 ? 'dossier' : 'scout_observation',
        runId: `run-${index}`, runStatus: 'completed', terminalRunId: `run-${index}`,
        evidenceRunId: `run-${index}`, outcome: 'success',
        artifactType: index === 0 ? 'dossier' : 'scout_observation',
        sourceRefs: summary.evidence, content: {} })) };
    const subject = { domain: 'child_coordination', method,
      result: { ...content, coordinationEvidence } };
    assert.equal(checks.checkObservation(subject, 'delegation_manifest_map').status, 'verified');
    assert.equal(checks.checkObservation(subject, 'delegation_child_scan').status, 'verified');
    const stale = structuredClone(subject);
    stale.result.coordinationEvidence.children[0].terminalRunId = 'old-run';
    assert.equal(checks.checkObservation(stale, 'delegation_manifest_map').status, 'refuted');
    const forged = structuredClone(subject);
    forged.result.childSummaries[1].evidence = ['receipt://forged'];
    assert.equal(checks.checkObservation(forged, 'delegation_child_scan').status, 'refuted');
  } finally { dispatch.dispatchSubOrchestratorWorker = original; }
}

Promise.all([checkRecoveryOracles(), checkCoordinationOracles()]).then(() => {
console.log('Independent worker oracles for observation, delegation, recovery, Lean and tamper refusal: PASS');
}).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
