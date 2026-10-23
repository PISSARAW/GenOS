'use strict';

const path = require('path');
const telemetry = require('../src/services/telemetryObserver');

function buildActionContext(ctx) {
  return { db: ctx.db, action: ctx.action, request: ctx.request, task: ctx.task,
    orchestratorId: ctx.orchestratorId, id: ctx.id, missionId: ctx.missionId,
    repoRoot: path.resolve(__dirname, '../..'), bridgePath: path.join(__dirname, 'genos-orchestrate.cjs'),
    waitForCompletion: ctx.waitForCompletion };
}

async function runActionWithCleanup(actionContext, handleAction, state) {
  let handled = false;
  try { handled = await handleAction(actionContext); }
  finally {
    if (actionContext.delegatedWorkerId) state.delegatedWorkerId = actionContext.delegatedWorkerId;
    if (actionContext.reusedWorker) state.reusedWorker = true;
  }
  if (handled) emitTopologyEvent(actionContext.orchestratorId, actionContext.action);
  return handled;
}

function emitTopologyEvent(orchestratorId, action) {
  const events = {
    dispatch_team: ['TOPOLOGY_DISPATCH_ACCEPTED', 'DISPATCH_A_TEAM', 'A-Team topology accepted.'],
    dispatch_trinity: ['TOPOLOGY_DISPATCH_ACCEPTED', 'DISPATCH_TRINITY', 'Trinity topology accepted.'],
    dispatch_biological: ['BIOLOGICAL_MISSION_COMPLETED', 'COMPLETE_BIOLOGICAL_MODE', 'Biological topology completed.']
  }[action];
  if (events) telemetry.emitEvent({ eventType: events[0], agentId: orchestratorId,
    action: events[1], detail: events[2], payload: { action }, severity: 'info' });
}

async function applyNceEnhancements(nceInput, db, orchestratorId) {
  const integration = require('../src/services/nceIntegrationService');
  try { return await integration.enhanceMissionWithNCE(nceInput, db); }
  catch (error) {
    telemetry.emitEvent({ eventType: 'NCE_ENHANCEMENT_ERROR', agentId: orchestratorId,
      action: 'NCE_SKIPPED', detail: error.message, severity: 'warn' });
    return { errors: { integration: error.message } };
  }
}

module.exports = { buildActionContext, runActionWithCleanup, emitTopologyEvent, applyNceEnhancements };
