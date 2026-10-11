'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createManifest } = require('./workerComplianceManifest.cjs');

async function readExecutionRun(db, execution) {
  if (!execution?.executionRun?.id) return null;
  return db.get('SELECT status,guardrail_reason FROM strategy_execution_runs WHERE id = ?', execution.executionRun.id);
}

async function inspectOracle(db, execution, workerId) {
  if (!execution?.deterministic || !execution?.executionRun?.id) return { status: 'not_applicable' };
  const checked = await require('../src/services/epistemic/nativeOracleInspection').inspect(db,
    { runId: execution.executionRun.id, agentId: workerId });
  return { status: checked.status, processes: checked.costs?.processes || 0,
    complete: checked.costs?.complete === true, decisionStatus: checked.decision?.status || null,
    decisionHash: checked.decision?.hash || null };
}

function oracleAccepted(execution, oracle) {
  if (!execution?.deterministic) return null;
  return [oracle.status === 'accepted_at_decision', oracle.decisionStatus === 'completed',
    oracle.complete, oracle.processes === 2].every(Boolean);
}

function missionError({ passed, artifactValidationError, execution, report, eventPayload }) {
  if (passed) return null;
  return eventPayload.failure?.reason || artifactValidationError || execution?.error || report?.error
    || 'Positive evidence or expected refusal scenarios did not satisfy the contract.';
}

function successfulOutcome(result) {
  return [result.persistedContract, result.parentBound, result.runtimeStarted, result.executionRunBound,
    result.run?.status === 'completed', result.eventType === 'AGENT_COMPLETED',
    result.report?.outcome === 'success',
    !result.nativeExecution || result.oracleAccepted === true,
    result.artifact === result.expected, result.artifactValidated,
    result.correctReference, result.refusalsValidated].every(Boolean);
}

function saveResult(result) {
  const reportPath = path.join(process.env.GENOS_COMPLIANCE_ROOT, 'worker-compliance-report.json');
  const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    : { isolatedRoot: process.env.GENOS_COMPLIANCE_ROOT, database: process.env.GENOS_DB_PATH,
      workspaceRoot: process.env.GENOS_WORKSPACE_ROOT, capsuleRoot: process.env.GENOS_CAPSULE_ROOT,
      model: process.env.GENOS_LOCAL_MODEL || null, results: [] };
  report.runs ||= {};
  if (!Object.hasOwn(report.runs, result.runId)) {
    Object.defineProperty(report.runs, result.runId, { enumerable: true, configurable: true,
      writable: true, value: createManifest({ root: path.resolve(__dirname, '../..'),
        runId: result.runId, model: process.env.GENOS_LOCAL_MODEL }) });
  }
  const key = (entry) => `${entry.runId}:${entry.kind}`;
  report.results = [...report.results.filter((entry) => key(entry) !== key(result)), result];
  const temporary = `${reportPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(report, null, 2));
  fs.renameSync(temporary, reportPath);
}

module.exports = { readExecutionRun, inspectOracle, oracleAccepted, missionError,
  successfulOutcome, saveResult };
