'use strict';

const planner = require('./symbiosisPlanner');
const executor = require('./symbiosisExecutor');
const health = require('./holobiontHealthLoop');

async function runCycle(db, input = {}, dependencies = {}) {
  const planCapability = dependencies.planCapability || planner.planCapability;
  const executeCapability = dependencies.executeCapability || executor.executeCapability;
  const assessHealth = dependencies.assessHealth || health.assess;
  const plan = await planCapability(db, input);
  if (plan.status !== 'READY') return {
    status: 'CAPABILITY_GAP', capability: plan.capability,
    rankedCandidates: plan.ranked || [], discoveryRequired: true
  };
  const execution = await executeCapability(db, plan, { ...input, executeCapability: input.executeCapability });
  if (!execution.accepted) return { status: 'EXECUTION_REJECTED', execution };
  const session = await require('../holobiontStore').getSession(db, plan.session.holobiontId);
  const healthReport = await assessHealth(db, {
    holobiontId: session.holobiontId, symbiontId: plan.resident.id,
    resourcePressure: input.resourcePressure, dependencyScore: input.dependencyScore,
    falseAlertRate: input.falseAlertRate, fitnessVector: input.fitnessVector,
    dysbiosisSignals: input.dysbiosisSignals
  });
  return {
    status: 'VERIFIED', holobiontId: session.holobiontId,
    sessionRevision: session.revision, capability: plan.capability,
    symbiontId: plan.resident.id, execution, health: healthReport,
    transmissionState: session.transmissionState,
    lifecycleAction: healthReport.nextAction
  };
}

module.exports = { runCycle };
