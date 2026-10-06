'use strict';

const planner = require('./symbiosisPlanner');
const executor = require('./symbiosisExecutor');
const health = require('./holobiontHealthLoop');
const governance = require('./holobiontGovernanceLoop');
const store = require('../holobiontStore');

async function runCycle(db, input = {}, dependencies = {}) {
  const planCapability = dependencies.planCapability || planner.planCapability;
  const executeCapability = dependencies.executeCapability || executor.executeCapability;
  const assessHealth = dependencies.assessHealth || health.assess;
  const plan = await planCapability(db, input);
  if (plan.status !== 'READY') return {
    status: 'CAPABILITY_GAP', capability: plan.capability,
    rankedCandidates: plan.ranked || [], relationChoice: plan.relationChoice || null,
    discoveryRequired: true
  };
  const execution = await executeCapability(db, plan, input);
  if (execution.accepted !== true) return { status: 'EXECUTION_REJECTED', execution };
  const healthInput = { ...input, holobiontId: plan.session.holobiontId,
    symbiontId: plan.resident.id, verifierId: execution.contribution?.verifierId };
  const report = await assessHealth(db, healthInput);
  const healthReport = await governance.applyHealthAction(db, healthInput, report);
  const session = await store.getSession(db, plan.session.holobiontId);
  return {
    status: 'VERIFIED', holobiontId: session.holobiontId,
    sessionRevision: session.revision, capability: plan.capability,
    symbiontId: plan.resident.id, execution, health: healthReport,
    transmissionState: session.transmissionState,
    lifecycleAction: healthReport.nextAction
  };
}

module.exports = { runCycle };
