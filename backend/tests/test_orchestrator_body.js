const assert = require('node:assert/strict');
const bodyService = require('../src/services/orchestratorBodyService');
const missionPlanning = require('../src/services/agentRuntimeAdapter/missionPlanning');

function sampleContext() {
  return {
    agentId: 'body-orchestrator',
    dispatchedAgent: { execution_mode: 'orchestrator' },
    normalizedMission: {
      prompt: 'Repair failing tests with proof.',
      workspaceRoot: process.cwd(),
      toolLease: ['genos_snapshot', 'genos_run'],
      evidenceDebt: ['no_replay_yet'],
      recentFailures: 2,
      executionPolicy: { allowedCommands: ['npm test'] }
    },
    runtimeBudget: { tokens: 800, workerShare: 0.6, orchestratorReserve: 0.4, timeoutMs: 1000 },
    autonomyPlan: { organization: 'hub_and_spoke', dispatchWorkers: [{ role: 'reviewer' }], workers: [{ role: 'reviewer' }] },
    executable: 'node'
  };
}

const body = bodyService.buildOrchestratorBody(sampleContext());
assert.equal(body.loop.join(' -> '), 'perceive -> interpret -> decide -> act -> sense_consequences -> learn');
assert(body.percepts.every((percept) => percept.kind && percept.source && percept.timestamp));
assert(body.percepts.every((percept) => percept.sensorOwnerAgentId === 'body-orchestrator'));
assert(body.percepts.every((percept) => percept.provenanceStatus === 'context_unverified'
  && percept.observationAttested === false));
assert.equal(body.percepts.find((percept) => percept.kind === 'filesystem_state').observedDomain, 'world');
assert.equal(body.percepts.find((percept) => percept.kind === 'metabolic_budget').observedDomain, 'self');
assert.deepEqual(body.effectors.map((effector) => effector.ownerAgentId), ['body-orchestrator', 'body-orchestrator']);
assert.equal(body.worldState.budget, 800);
assert.equal(body.worldState.activeWorkers, 1);
assert(body.worldState.uncertain);
assert(body.worldState.stress > 0.7);
assert(body.survival.state.viability >= 0 && body.survival.state.viability <= 1);
assert(body.survival.pressures.includes('starvation'));
assert(body.reflexes.some((reflex) => reflex.id === 'budget_conservation'));
assert(body.reflexes.some((reflex) => reflex.id === 'homeostasis_guard'));
assert(body.reflexes.some((reflex) => reflex.id === 'failure_inflammation'));
assert(body.reflexes.some((reflex) => reflex.id === 'evidence_debt_gate'));
assert.equal(body.actuators.FileActuator.rollback, true);

const unknown = bodyService.buildOrchestratorBody({ normalizedMission: { executionBudget: { tokens: 10000 } } });
const missingBudget = unknown.percepts.find((percept) => percept.kind === 'metabolic_budget');
assert.equal(missingBudget.value.tokens, null);
assert.equal(missingBudget.value.status, 'unknown');
assert.equal(missingBudget.confidence, 0);
assert.equal(unknown.worldState.budget, null);
assert.equal(unknown.worldState.budgetKnown, false);
assert(unknown.reflexes.some((reflex) => reflex.id === 'budget_conservation'));

const zero = bodyService.buildOrchestratorBody({ runtimeBudget: { tokens: 0 } });
assert.equal(zero.worldState.budget, 0);
assert.equal(zero.worldState.budgetKnown, true);

const finalContext = sampleContext();
finalContext.normalizedRuntimeBudget = { tokens: 10000 };
finalContext.runtimeBudget = { tokens: 4000 };
finalContext.normalizedMission.toolLease = ['genos_snapshot'];
const finalBody = bodyService.buildOrchestratorBody(finalContext);
assert.equal(finalBody.worldState.budget, 4000);
assert.deepEqual(finalBody.worldState.availableTools, ['genos_snapshot']);

const allocatedContext = sampleContext();
allocatedContext.normalizedRuntimeBudget = { tokens: 10000, workerShare: 0.6, orchestratorReserve: 0.4 };
allocatedContext.autonomyPlan.tokenPolicy = { total: 10000, workerShare: 0.6, orchestratorReserve: 0.4 };
delete allocatedContext.runtimeBudget;
missionPlanning.computeRuntimeBudget(allocatedContext);
missionPlanning.incarnateOrchestrator(allocatedContext);
assert.equal(allocatedContext.orchestratorBody.worldState.budget, 4000);
assert.equal(allocatedContext.orchestratorBody.worldState.budgetStatus, 'allocated');
assert.deepEqual(allocatedContext.orchestratorBody.worldState.availableTools, ['genos_snapshot', 'genos_run']);

const ctx = sampleContext();
missionPlanning.incarnateOrchestrator(ctx);
assert.equal(ctx.normalizedMission.autonomousOrchestration, false);
assert.equal(ctx.normalizedMission.requiresEvidenceBeforePromotion, true);
assert(ctx.normalizedMission.orchestratorBody.actions.some((action) => action.action === 'network_silence'));

const frozen = bodyService.buildOrchestratorBody({ normalizedMission: { toolLease: ['genos_orchestrate'] } });
assert(frozen.reflexes.some((reflex) => reflex.id === 'block_destructive_actuator'));

const reproductive = bodyService.buildOrchestratorBody({
  normalizedMission: { survivalState: { energy: 1, coherence: 0.9, reproductionPotential: 0.9, independentlyValidated: true } },
  runtimeBudget: { tokens: 12000 }
});
assert(reproductive.reflexes.some((reflex) => reflex.id === 'validated_strategy_reproduction'));

const dormantContext = sampleContext();
dormantContext.runtimeBudget.tokens = 100;
missionPlanning.incarnateOrchestrator(dormantContext);
assert.equal(dormantContext.normalizedMission.survivalStatus, 'dormant');
assert(dormantContext.normalizedMission.orchestratorBody.actions.some((action) => action.action === 'snapshot_and_suspend'));

console.log('Orchestrator body percepts, world state and reflexes are explicit.');
