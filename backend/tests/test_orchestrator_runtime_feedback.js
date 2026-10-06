'use strict';

const assert = require('node:assert/strict');
const feedback = require('../src/services/orchestratorRuntimeFeedback');

function context() {
  return {
    agentId: 'orchestrator', executionRun: { id: 'run' },
    dispatchedAgent: { execution_mode: 'orchestrator' },
    normalizedMission: { prompt: 'Verify a patch', workspaceRoot: process.cwd(), toolLease: ['genos_replay'], autonomousOrchestration: true, evidenceDebt: ['independent_replay'], openGoals: ['verify patch'] },
    runtimeBudget: { tokens: 3000 }, autonomyPlan: { dispatchWorkers: [] },
    db: { get: async () => ({ budget_json: '{"tokens":3000}', metrics_json: '{"tokens":2300}' }) },
    emitTracked: () => {}
  };
}

async function main() {
  const ctx = context();
  const event = { id: 'failed-test', eventType: 'EVIDENCE_REPORT', payload: { outcome: 'failure' } };
  const body = await feedback.process(ctx, event);
  assert.equal(body.worldState.budget, 700);
  assert.equal(ctx.normalizedMission.autonomousOrchestration, false);
  assert.equal(ctx.normalizedMission.requiresEvidenceBeforePromotion, true);
  assert.deepEqual(body.worldState.openGoals, ['verify patch']);
  assert(body.worldState.evidenceDebt.includes('failed_evidence:failed-test'));
  await feedback.process(ctx, { id: 'failed', eventType: 'AGENT_FAILED', payload: {} });
  assert.equal(ctx.normalizedMission.recentFailures, 1);
  await feedback.process(ctx, { id: 'failed', eventType: 'AGENT_FAILED', payload: {} });
  assert.equal(ctx.normalizedMission.recentFailures, 1);
  await feedback.process(ctx, { id: 'failed-second', eventType: 'AGENT_FAILED', payload: {} });
  assert.equal(ctx.normalizedMission.recentFailures, 2);
  const latest = await feedback.process(ctx, { id: 'evidence', eventType: 'EVIDENCE_REPORT', payload: { outcome: 'success', claims: [{ claim: 'test passed', evidence: ['test.log'] }] } });
  assert(latest.worldState.evidenceDebt.includes('independent_replay'));
  assert.equal(latest.percepts.at(-1).value.evidencePresent, true);
  assert.equal(feedback.feedbackPercept({ id: 'exit', eventType: 'AGENT_COMPLETED', payload: {} }).value.evidencePresent, false);
  ctx.dispatchedAgent.execution_mode = 'worker';
  assert.equal(await feedback.process(ctx, event), null);
  console.log('Orchestrator feedback: measured budget, goals, failures, retained evidence debt and worker isolation passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
