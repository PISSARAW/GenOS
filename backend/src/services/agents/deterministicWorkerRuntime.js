'use strict';

const { emit, updateAgent } = require('../agentOrchestrationState');
const { recordExecutionEvent } = require('../strategyExecutionService');
const { recordWorkerEvidence } = require('../agentEvidenceService');
const { validateWorkerArtifact } = require('./workerArtifactContract');
const { runProcedure } = require('./deterministicWorkerProcedures');
const { runFormal } = require('./deterministicWorkerFormal');
const { runVerification } = require('./deterministicWorkerVerifier');
const { runRed } = require('./deterministicWorkerRed');
const { runExperiment } = require('./deterministicWorkerExperiment');
const { runSynthesis } = require('./deterministicWorkerSynthesis');
const { runMonitor } = require('./deterministicWorkerMonitor');
const { runForensic } = require('./deterministicWorkerForensic');
const { runScout } = require('./deterministicWorkerScout');

const EXECUTORS = Object.freeze({
  formal_worker: (method, mission) => runFormal(method, { timeoutMs: mission.timeoutMs || 30000 }),
  verifier_worker: (method) => runVerification(method),
  red_worker: (method) => runRed(method),
  experimental_worker: (method) => runExperiment(method),
  synthesis_worker: (method) => runSynthesis(method),
  resident_daemon: (method) => runMonitor(method),
  forensic_worker: (method) => runForensic(method),
  scout_cell: (method) => runScout(method)
});

function reportFor(kind, result) {
  if (kind === 'scout_cell') {
    const refs = result.scannedSources;
    const statement = `${result.observations.length} literal observations across ${refs.length} supplied sources.`;
    return { outcome: 'success', claims: [{ statement, evidence: refs }],
      workerArtifact: { type: 'scout_observation', content: result,
        provenance: { sourceRefs: refs } } };
  }
  if (kind === 'forensic_worker') {
    const refs = result.evidence;
    const statement = `${result.causalChain.length} declared causal links reconstructed; causal truth unverified.`;
    return { outcome: 'success', claims: [{ statement, evidence: refs }],
      workerArtifact: { type: 'causal_dossier', content: result, provenance: { sourceRefs: refs } } };
  }
  if (kind === 'resident_daemon') {
    const refs = result.territoryReport.sourceRefs;
    const claim = `${result.anomalies.length} of ${result.sampleCount} samples exceeded ${result.threshold}.`;
    return { outcome: 'success', claims: [{ statement: claim, evidence: refs }],
      workerArtifact: { type: 'dossier', content: { claims: [{ statement: claim, evidence: refs }],
        territoryReport: result.territoryReport, anomalies: result.anomalies,
        monitorReceipt: result.monitorReceipt }, provenance: { sourceRefs: refs } } };
  }
  if (kind === 'synthesis_worker') {
    const refs = result.sources;
    return { outcome: 'success', claims: [{ statement: result.synthesis, evidence: refs }],
      workerArtifact: { type: 'synthesis_dossier', content: result, provenance: { sourceRefs: refs } } };
  }
  if (kind === 'experimental_worker') {
    const ref = result.procedureReceipt.id;
    return { outcome: 'success', claims: [{ statement: result.conclusion, evidence: [ref] }],
      workerArtifact: { type: 'experiment_record', content: result, provenance: { sourceRefs: [ref] } } };
  }
  if (kind === 'formal_worker') {
    const ref = result.solverReceipt.id;
    return { outcome: 'success', claims: [{ statement: result.claim, evidence: [ref] }],
      workerArtifact: { type: 'formal_certificate', content: result, provenance: { sourceRefs: [ref] } } };
  }
  if (kind === 'verifier_worker' || kind === 'red_worker') {
    const ref = result.expectedReceipt.id;
    return { outcome: 'success', claims: [{ statement: `Verification verdict: ${result.verdict}.`, evidence: [ref] }],
      workerArtifact: { type: 'verification_report', content: result, provenance: { sourceRefs: [ref] } } };
  }
  const ref = result.receipt.id;
  const claim = `Procedure ${result.methodId} computed ${JSON.stringify(result.output)}.`;
  return { outcome: 'success', claims: [{ statement: claim, evidence: [ref] }],
    workerArtifact: { type: 'dossier', content: { claims: [{ statement: claim, evidence: [ref] }],
      procedureReceipt: result.receipt }, provenance: { sourceRefs: [ref] } } };
}

async function publish(db, mission, event) {
  recordWorkerEvidence(mission, event);
  await recordExecutionEvent(db, mission.agentId, event);
}

async function runDeterministicWorker(db, mission, executionRun) {
  const kind = mission.workerKind;
  const method = mission.methodContract || mission.workerContract?.mission?.methodContract;
  await updateAgent(mission.agentId, 'running', mission.prompt);
  const started = emit(mission.agentId, 'DETERMINISTIC_WORKER_STARTED', kind, 'Deterministic worker started.', {
    executionRunId: executionRun.id, methodId: method.methodId
  }, 'info', 'running');
  await publish(db, mission, started);
  try {
    const execute = EXECUTORS[kind] || runProcedure;
    const result = await execute(method, mission);
    const evidenceReport = reportFor(kind, result);
    validateWorkerArtifact({ events: [{ evidenceReport }] }, mission);
    await updateAgent(mission.agentId, 'completed', 'Deterministic result certified');
    const completed = emit(mission.agentId, 'AGENT_COMPLETED', kind, 'Deterministic worker completed.', {
      executionRunId: executionRun.id, evidenceReport, usage: { input_tokens: 0, output_tokens: 0, tokens: 0 }
    }, 'info', 'completed');
    await publish(db, mission, completed);
    return { started: true, executionRun, deterministic: true, result };
  } catch (error) {
    await updateAgent(mission.agentId, 'error', error.message);
    const failed = emit(mission.agentId, 'AGENT_FAILED', kind, error.message, {
      executionRunId: executionRun.id, failure: { category: 'deterministic_execution', reason: error.message, code: error.code }
    }, 'warning', 'error');
    await publish(db, mission, failed);
    return { started: false, executionRun, deterministic: true, error: error.message, code: error.code };
  }
}

module.exports = { reportFor, runDeterministicWorker };
