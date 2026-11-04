'use strict';

const failure = () => Object.assign(new Error('Canonical read-only synthesis requires current delegated native semantic evidence.'),
  {code: 'CANONICAL_NATIVE_EVIDENCE_REQUIRED'});

async function parentRun(db, mission) {
  if (mission.executionRunId) {
    return db.get('SELECT * FROM strategy_execution_runs WHERE id=? AND agent_id=?',
      mission.executionRunId, mission.agentId);
  }
  const scope = mission.modelBudgetScope || JSON.parse(mission.modelBudgetScopeJson || 'null');
  return db.get(`SELECT r.* FROM strategy_execution_runs r JOIN mission_model_budget_scopes b
    ON b.parent_run_id=r.id WHERE b.scope_id=? AND b.parent_agent_id=? AND r.agent_id=?`,
  scope?.id, mission.agentId, mission.agentId);
}

async function evaluate(state, reply, suppliedDb = null) {
  const report = require('./localRuntimeSynthesis').parseReply(reply);
  if (report.schema !== 'genos.canonical-final-report/v1') return null;
  const db = suppliedDb || await require('../db').getDatabase();
  const mission = state.mission;
  const run = await parentRun(db, mission);
  if (!run) throw failure();
  const contract = await require('./strategyContractService').getContractById(db, run.contract_id);
  if (!['factual_read_only', 'formal_read_only'].includes(contract?.contract.evaluation_mode)) return null;
  const current = await require('./missionEnvelopeAuthority').assertRun(db,
    {agentId: mission.agentId, runId: run.id});
  if (current.status !== 'authorized' || current.envelope.missionId !== mission.missionId) throw failure();
  const verification = await require('./epistemic/nativeOracleGate').context(db, {row: run,
    event: {eventType: 'AGENT_COMPLETED', payload: {executionRunId: run.id, evidenceReport: report}}});
  if (verification?.delegated !== true
    || !require('./biologicalWorkerReceiptService').semanticProofAccepted(verification)) throw failure();
  return {status: 'verified_claims', runId: run.id, missionId: mission.missionId,
    workerIds: report.delegatedOracleRefs.map(reference => reference.agentId),
    verification: 'delegated_native_semantic_oracles', promotion: 'not_requested'};
}

module.exports = {evaluate};
