'use strict';

async function required(db, event) {
  const runId = event.payload?.executionRunId;
  if (event.eventType !== 'AGENT_COMPLETED' || !runId) return false;
  const row = await db.get('SELECT contract_id FROM strategy_execution_runs WHERE id=?', runId);
  if (!row) return false;
  const saved = await require('./strategyContractService').getContractById(db, row.contract_id);
  return saved?.contract?.promotion?.require_replay === true;
}

async function attach(context) {
  const {db, mission, event} = context;
  if (!await required(db, event)) return null;
  const decision = require('./orchestrationDecisionService').decideFromEvent({
    ...event, payload: {...event.payload, advice: false}});
  if (decision?.tool !== 'genos_replay') throw Error('WORKER_REQUIRED_REPLAY_DECISION_MISSING');
  const action = await require('./orchestrationActionExecutor').execute({
    orchestratorId: mission.orchestratorAgentId || mission.agentId, sourceAgentId: mission.agentId,
    decision, event, workspaceRoot: mission.workspaceRoot});
  if (!action?.executed || !action.result?.proof) {
    throw Object.assign(new Error(action?.result?.error || action?.reason || 'Required native replay did not produce its proof.'),
      {code: 'WORKER_REQUIRED_REPLAY_FAILED', replayResult: action});
  }
  const receipt = await require('./workerCodeReplay').execute({...context, chainProof: action.result.proof});
  event.payload.replayReceipt = receipt;
  const decisionId = await require('./workerCodeDeliveryDecision').record(context);
  if (decisionId) event.payload.deliveryDecisionId = decisionId;
  return receipt;
}
module.exports = {attach, required};
