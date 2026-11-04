'use strict';

const execution = require('./strategyExecutionService');
const runtime = require('./missionProtocols/runtime');

async function plan(ctx) {
  if (ctx.normalizedMission.observationRequiredBeforePlanning !== true) {
    throw new Error('NATIVE_CONTROLLER_VERIFIED_OBSERVATION_REQUIRED');
  }
  const autonomyPlan = await require('./agentAutonomyPlanService').buildAutonomyPlanForMission(ctx);
  autonomyPlan.scheduling = { mode: 'observation-gated', topologyActivated: false };
  return autonomyPlan;
}

async function prepare(mission) {
  const authority = require('./missionExecutionAuthority');
  const db = await require('../db').getDatabase();
  const lease = await authority.reserve(db, { missionId: mission.missionId, agentId: mission.agentId });
  await authority.claimLaunch(db, lease);
  try {
    const ctx = await prepareClaimed({ ...mission, missionExecutionAuthority: lease });
    await authority.mark(db, { authority: lease, state: 'running' });
    return ctx;
  } catch (failure) {
    await authority.mark(db, { authority: lease, state: 'failed' });
    throw failure;
  }
}

async function prepareClaimed(mission) {
  const ctx = await require('./agentRuntimeAdapter/missionExecution').bootstrapMission({
    ...mission, executionController: 'native-coordinator' });
  if (ctx.dispatchedAgent.execution_mode !== 'orchestrator') throw new Error('NATIVE_CONTROLLER_ORCHESTRATOR_REQUIRED');
  await require('./agentOrchestrationState').updateAgent(ctx.agentId, 'running', ctx.normalizedMission.prompt);
  await runtime.beforeExecution(ctx);
  await execution.recordExecutionEvent(ctx.db, ctx.agentId, { id: `native-controller:${ctx.executionRun.id}`,
    eventType: 'AGENT_RUNTIME_STARTED', timestamp: new Date().toISOString(),
    detail: 'Native in-process coordinator entered its sealed mission.',
    payload: { executionRunId: ctx.executionRun.id } });
  return ctx;
}

async function run(ctx, action) {
  await require('./missionEnvelopeAuthority').assertRun(ctx.db, { agentId: ctx.agentId,
    runId: ctx.executionRun.id, mission: ctx.normalizedMission, verifyInputs: true,
    executable: require.resolve('./nativeMissionController') });
  return runtime.runInProcess(ctx, action);
}

async function complete(ctx, report) {
  await require('./missionEnvelopeAuthority').assertRun(ctx.db, {
    agentId: ctx.agentId, runId: ctx.executionRun.id, mission: ctx.normalizedMission });
  await execution.recordExecutionEvent(ctx.db, ctx.agentId, { id: `native-controller-completed:${ctx.executionRun.id}`,
    eventType: 'AGENT_COMPLETED', timestamp: new Date().toISOString(),
    detail: 'Coordinator submitted its delegated evidence to native completion gates.',
    payload: { executionRunId: ctx.executionRun.id, evidenceReport: report,
      ...await require('./workerModelRunUsage').forRun({ db: ctx.db, executionRun: ctx.executionRun,
        mission: ctx.normalizedMission }) } });
  const qualified = await require('./missionProtocols/windowsCompletion').qualify(ctx, { started: true });
  if (!qualified.nativeCompletion) throw new Error('NATIVE_CONTROLLER_COMPLETION_REQUIRED');
  const completion = await require('./nativeControllerCompletion').close(ctx, qualified.nativeCompletion);
  await require('./agentOrchestrationState').updateAgent(ctx.agentId, 'completed', 'Native evidence accepted.');
  return completion;
}

module.exports = { plan, prepare, run, complete };
