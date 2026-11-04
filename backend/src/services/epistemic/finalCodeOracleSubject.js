'use strict';
const journal = require('./nativeOracleJournal');
const authority = require('../missionEnvelopeAuthority');
const provenance = require('../gvxMissionProvenance');

async function load(db, request) {
  const saved = request.completedEvidence === true ? await authority.assertCompletedRunEvidence(db, request)
    : await authority.assertRun(db, request);
  const contract = saved.envelope.workspaceVerificationContract;
  if (!contract || saved.envelope.orchestratorId !== request.agentId) throw Error('FINAL_CODE_AUTHORITY_REQUIRED');
  const run = await provenance.readRun(db, {runId: request.runId, scope: request.scope});
  const observed = await journal.read(db, {...request, kind: 'final-code-observation'});
  if (!run || !observed || observed.value.authorityHash !== saved.hash) throw Error('FINAL_CODE_OBSERVATION_REQUIRED');
  const binding = {schema: 'genos.final-code-authority-binding/v1', agentId: request.agentId,
    runId: request.runId, authorityHash: saved.hash, contract};
  return require('./oracleWorkspaceSubject').buildSubject(db, {request, run, binding, contract, authority: saved,
    observed: {hash: observed.hash, event: {timestamp: observed.value.timestamp,
      payload: {evidenceReport: observed.value.report}}}});
}

async function observe(db, input) {
  const saved = await authority.read(db, input.executionRun.id);
  if (!saved?.envelope.workspaceVerificationContract) return null;
  await authority.assertRun(db, {agentId: input.mission.agentId, runId: input.executionRun.id});
  return journal.append(db, {kind: 'final-code-observation', scope: saved.envelope.scope,
    record: {schema: 'genos.final-code-observation/v1', runId: input.executionRun.id,
      agentId: input.mission.agentId, authorityHash: saved.hash,
      timestamp: new Date().toISOString(), report: input.evidenceReport}});
}
async function terminal(db, event) {
  const runId = event.payload?.executionRunId;
  const saved = await authority.read(db, runId);
  if (!saved?.envelope.workspaceVerificationContract) return null;
  return journal.append(db, {kind: 'final-code-completion', scope: saved.envelope.scope,
    record: {schema: 'genos.final-code-completion/v1', runId,
      event: require('../workerReportSerialization').serialized(event)}});
}
module.exports = {load, observe, terminal};
