'use strict';

const planner = require('./symbiosisPlanner');
const executor = require('./symbiosisExecutor');
const health = require('./holobiontHealthLoop');
const governance = require('./holobiontGovernanceLoop');
const store = require('../holobiontStore');

function cycleReceipt(session, result) {
  return {
    ...result,
    holobiontId: session.holobiontId,
    sessionRevision: session.revision,
    sessionStatus: session.status,
    sessionClosed: session.status === 'CLOSED'
  };
}

async function runCycle(db, input = {}, dependencies = {}) {
  const planCapability = dependencies.planCapability || planner.planCapability;
  const executeCapability = dependencies.executeCapability || executor.executeCapability;
  const assessHealth = dependencies.assessHealth || health.assess;
  const plan = await planCapability(db, input);
  if (plan.status !== 'READY') return cycleReceipt(plan.session, {
    status: 'CAPABILITY_GAP', capability: plan.capability,
    rankedCandidates: plan.ranked || [], relationChoice: plan.relationChoice || null,
    discoveryRequired: true
  });
  const execution = await executeCapability(db, plan, input);
  if (execution.accepted !== true) {
    const session = await store.getSession(db, plan.session.holobiontId);
    return cycleReceipt(session, { status: 'EXECUTION_REJECTED', execution });
  }
  const healthInput = { ...input, holobiontId: plan.session.holobiontId,
    symbiontId: plan.resident.id, verifierId: execution.contribution?.verifierId };
  const report = await assessHealth(db, healthInput);
  const healthReport = await governance.applyHealthAction(db, healthInput, report);
  const session = await store.getSession(db, plan.session.holobiontId);
  // runCycle never finalizes a Host session; the mission/host layer owns
  // CLOSED versus QUIESCENT. Every normal cycle receipt still exposes the
  // observed session status and the derived sessionClosed flag.
  return cycleReceipt(session, {
    status: 'VERIFIED', capability: plan.capability,
    symbiontId: plan.resident.id, execution, health: healthReport,
    transmissionState: session.transmissionState,
    lifecycleAction: healthReport.nextAction
  });
}

module.exports = { runCycle };
