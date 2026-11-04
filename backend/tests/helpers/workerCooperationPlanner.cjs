'use strict';

const assert = require('node:assert/strict');
const contract = require('./workerCooperationPlannerContract.cjs');

function recordUsage(context, output) {
  assert.equal(output.tokenUsageMeasured, true, 'Planning requires measured provider token usage.');
  assert.ok(Number.isSafeInteger(output.inputTokens) && output.inputTokens >= 0);
  assert.ok(Number.isSafeInteger(output.outputTokens) && output.outputTokens >= 0);
  context.planningTokens = output.inputTokens + output.outputTokens;
  assert.ok(context.planningTokens <= contract.LIMITS.totalTokens);
}

async function planning(context, observation) {
  const finding = await require('./workerCooperationFinding.cjs').read(context, observation);
  const request = contract.request(finding);
  const provider = require('../../src/services/modelProvider');
  assert.ok(provider.estimateTokenCount(request.prompt) + contract.LIMITS.outputTokens <= contract.LIMITS.totalTokens);
  context.report.finding = finding;
  context.report.planningInput = { ...request, catalogSource: 'workerCooperationPlannerContract' };
  context.report.planningAttempted = true;
  context.planningTokens = null;
  await context.save();
  let output;
  try {
    const mission = context.control.ctx.normalizedMission;
    await require('../../src/services/missionEnvelopeAuthority').assertRun(context.db, {
      agentId: context.id, runId: context.control.run.id, mission });
    output = await require('../../src/services/modelRouter').generate({ db: context.db, agentId: context.id,
      executionRunId: context.control.run.id, cognitiveIntegration: 'orchestration_planner',
      ...await require('../../src/services/missionModelBudgetScope').routeBudget(mission, context.db),
      model: context.model, ...request, contextTokens: 16384, stream: false,
      maxTokens: contract.LIMITS.outputTokens, temperature: 0, timeoutMs: 120000 });
  } catch (error) {
    if (error.modelUsage) {
      context.report.planning = { ...error.modelUsage, error: error.message };
      recordUsage(context, error.modelUsage);
    }
    throw error;
  }
  context.report.planning = { ...output, scope: 'response_to_verified_daemon_finding', reused: false };
  recordUsage(context, output);
  assert.ok(!output.schemaViolation, 'Planner output violates the response schema.');
  context.report.acceptedPlan = contract.validatePlan(JSON.parse(output.text), finding);
  await require('../../src/services/gvxDevelopmentLedger').appendEvent(context.db, {
    id: `cooperation-plan:${context.control.run.id}`,
    ...findingScope(context), type: 'decision_recorded', payload: { kind: 'cooperation_plan',
      parentRunId: context.control.run.id, findingRunId: finding.runId, plan: context.report.acceptedPlan } });
  await context.save();
  return context.report.acceptedPlan;
}

function findingScope(context) {
  const scope = context.control.ctx.normalizedMission.modelBudgetScope;
  return { organizationId: scope.organizationId, projectId: scope.projectId, entityId: context.id };
}

function goal(context, kind) {
  const step = context.report.acceptedPlan.steps.find(item => item.kind === kind);
  return `Planner goal (cannot expand your sealed authority): ${JSON.stringify(step.goal)}.`;
}

module.exports = { planning, goal };
