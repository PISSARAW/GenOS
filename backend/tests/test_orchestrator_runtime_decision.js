'use strict';
const assert = require('node:assert/strict');
const state = require('../src/services/agentOrchestrationState');
const evidence = require('../src/services/agentEvidenceService');
const decisions = require('../src/services/orchestrationDecisionService');
const executor = require('../src/services/orchestrationActionExecutor');
const saved = { emit: state.emit, evidence: evidence.hasDecisionEvidence, execute: executor.execute };
const events = [];
state.emit = (...args) => events.push(args);
const runtime = require('../src/services/orchestrationRuntimeDecision');
async function main() {
  let resolveOwner, resolveAction, action, settled = false;
  const ctx = {
    agentId: 'worker', normalizedMission: { orchestratorAgentId: 'owner' },
    dispatchedAgent: { execution_mode: 'worker' }, workspaceRoot: process.cwd(), state: {},
    db: { get: () => new Promise((resolve) => { resolveOwner = resolve; }) }
  };
  const event = { id: 'evidence-1', eventType: 'AGENT_COMPLETED', payload: { advice: 'rank' } };
  evidence.hasDecisionEvidence = () => true;
  executor.execute = (input) => {
    action = input;
    return new Promise((resolve) => { resolveAction = resolve; });
  };
  const processing = runtime.handle(ctx, event, event.eventType).then(() => { settled = true; });
  assert.equal(action, undefined);
  resolveOwner({ parent_agent_id: 'persisted-owner' });
  await Promise.resolve();
  assert.equal(action.orchestratorId, 'persisted-owner');
  assert.equal(action.sourceAgentId, 'worker');
  assert.equal(action.decision.tool, 'genos_execute_primitive');
  assert.equal(settled, false);
  resolveAction({ executed: true });
  await processing;
  assert.equal(settled, true);
  action = undefined;
  await runtime.handle(ctx, { eventType: 'AGENT_STEP' }, 'AGENT_STEP');
  await runtime.handle(ctx, { eventType: 'AGENT_FAILED' }, 'AGENT_FAILED');
  assert.equal(action, undefined);
  evidence.hasDecisionEvidence = () => false;
  await runtime.handle(ctx, event, event.eventType);
  assert.equal(action, undefined);
  assert(events.some((args) => args[1] === 'ORCHESTRATION_DECISION_BLOCKED'));
  evidence.hasDecisionEvidence = () => true;
  ctx.db.get = async () => ({ parent_agent_id: 'persisted-owner' });
  executor.execute = async () => { throw new Error('action unavailable'); };
  await runtime.handle(ctx, event, event.eventType);
  assert.equal(ctx.state.orchestrationActionFailure.error, 'action unavailable');
  assert(events.some((args) => args[1] === 'ORCHESTRATION_ACTION_FAILED'));
  console.log('Runtime decisions await owner lookup and actions, retain evidence gates and specialized worker recovery.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  state.emit = saved.emit;
  evidence.hasDecisionEvidence = saved.evidence;
  executor.execute = saved.execute;
});
