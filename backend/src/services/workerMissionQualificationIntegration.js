'use strict';

const qualification = require('./workerMissionQualificationGate');
const inspection = require('./epistemic/nativeOracleInspection');
const oracleGate = require('./epistemic/nativeOracleGate');
const oracleProof = require('./epistemic/nativeOracleProof');
const subjects = require('./epistemic/nativeOracleDomains');
const observations = require('./biologicalWorkerStore');
const provenance = require('./gvxMissionProvenance');
const values = require('./trinityProvenanceValues');

function outcome(status, reason) { return { status, reason }; }

function summaryValid(item) {
  const result = item?.result;
  return [item?.exitCode === 0, result?.passed === true,
    result?.runId === item?.runId, item?.manifest?.runId === item?.runId,
    result?.nativeExecution === true, result?.oracleAccepted === true,
    result?.status === 'completed', result?.terminalEvent === 'AGENT_COMPLETED',
    typeof result?.workerId === 'string', Boolean(result?.workerId),
    typeof result?.oracle?.decisionHash === 'string'].every(Boolean);
}

async function acceptedRun(db, item) {
  const rows = await db.all(`SELECT id FROM strategy_execution_runs
    WHERE agent_id = ? AND status = 'completed'`, item.result.workerId);
  const matching = [];
  for (const row of rows) {
    const checked = await inspection.inspect(db, { runId: row.id, agentId: item.result.workerId });
    if (checked.status === 'accepted_at_decision'
      && checked.decision?.hash === item.result.oracle.decisionHash) matching.push(row.id);
  }
  return matching.length === 1 ? matching[0] : null;
}

async function proofFor(db, runId, workerId) {
  const events = await observations.observations(db, runId);
  const terminal = events.filter((entry) => entry.applied
    && entry.event.eventType === 'AGENT_COMPLETED').at(-1)?.event;
  if (!terminal) return null;
  const scope = await provenance.agentScope(db, workerId);
  const accepted = await oracleGate.historical(db, { runId, agentId: workerId, event: terminal });
  if (!accepted || accepted.acceptance.value.status !== 'completed') return null;
  const report = terminal.payload.evidenceReport || terminal.payload.report;
  await oracleProof.assertCurrent(db, { proof: accepted.proof,
    request: { runId, agentId: workerId }, report });
  const subject = await subjects.load(db, { runId, agentId: workerId, scope });
  return { accepted, subject };
}

function gateInput(item, runId, checked) {
  const assembly = checked.accepted.proof.saved.evaluation.assembly;
  const result = assembly.results?.[0];
  const expectedContent = expectedEvidenceContent(checked.subject);
  if (!result?.evidence?.content || expectedContent === undefined) return null;
  return { runId, workerId: item.result.workerId, resultId: result.resultId,
    runStatus: 'completed', terminalEvent: 'AGENT_COMPLETED',
    expectedResultDigest: values.digest(expectedContent),
    actualResultDigest: values.digest(result.evidence.content),
    evidenceDigest: result.evidence.digest, receipts: assembly.verifications };
}

function expectedEvidenceContent(subject) {
  if (subject && Object.hasOwn(subject, 'content')) return subject.content;
  if (subject && Object.hasOwn(subject, 'method') && Object.hasOwn(subject, 'result')) {
    return { method: subject.method, result: subject.result };
  }
  return undefined;
}

async function evaluate(db, item, seenNonces) {
  if (!summaryValid(item)) return outcome('inconclusive', 'mission_not_verified');
  if (!(seenNonces instanceof Set)) return outcome('inconclusive', 'nonce_registry_missing');
  try {
    const runId = await acceptedRun(db, item);
    if (!runId) return outcome('inconclusive', 'accepted_oracle_run_missing');
    const checked = await proofFor(db, runId, item.result.workerId);
    if (!checked) return outcome('inconclusive', 'terminal_or_proof_missing');
    const input = gateInput(item, runId, checked);
    if (!input) return outcome('inconclusive', 'result_evidence_missing');
    return { ...qualification.evaluate(input, seenNonces), executionRunId: runId,
      decisionHash: item.result.oracle.decisionHash };
  } catch (error) {
    return { ...outcome('inconclusive', 'oracle_proof_invalid'),
      errorCode: error.code || 'ORACLE_PROOF_INVALID' };
  }
}

module.exports = { evaluate, expectedEvidenceContent };
