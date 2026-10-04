'use strict';

const { getDatabase } = require('../db');
const receptor = require('./signalReceptorService');
const runtimeMissionExecution = require('./agentRuntimeAdapter/missionExecution');
const { updateAgent } = require('./agentOrchestrationState');
const dynamicOrg = require('./dynamicOrganizationService');
const { authorizeReceptorAction } = require('./signalReceptorAuthority');

async function dispatchReceptorsIfNeeded(signal) {
  const db = await getDatabase();
  await receptor.refreshPersistedReceptors(db);
  const ctx = {
    authorizeAction: (registeredReceptor, routedSignal) => authorizeReceptorAction({
      db, receptor: registeredReceptor, signal: routedSignal,
    }),
    publishSignal: signal.publishSignal,
    startMission: async (mission) => ({ started: true, agentId: mission.agentId,
      result: await runtimeMissionExecution.startMission(mission) }),
    updateAgent: async (agentId, status, currentTask) => {
      await updateAgent(agentId, status, currentTask);
      return { updated: true, agentId, status };
    },
    changeOrganization: async (options) => ({ changed: true,
      organization: await dynamicOrg.changeOrganization(db, options) }),
  };
  const result = await receptor.matchAndDispatch(
    { signalId: signal.signalId, signalType: signal.signalType,
      semanticType: signal.signalData?.semanticType || signal.signalType,
      concentration: signal.signalData?.concentration ?? signal.signalData?.intensity ?? 1.0,
      topic: signal.topic, senderAgentId: signal.senderAgentId,
      depth: Number(signal.depth || 0),
      recipientAgentIds: Array.isArray(signal.recipientAgentIds) ? signal.recipientAgentIds : [],
      scope: signal.scope },
    ctx
  );
  return { dispatched: result.dispatched.some((item) => item.executed === true),
    results: result.dispatched, triggered: result.triggered, llmRequired: result.llmRequired };
}

async function dispatchReceptorsSafely(signal) {
  try {
    return await dispatchReceptorsIfNeeded(signal);
  } catch (err) {
    console.warn(`[SignalingTransport] dispatchReceptors failed for ${signal.signalId}: ${err.message}`);
    return { dispatched: false, llmRequired: true };
  }
}

module.exports = { dispatchReceptorsIfNeeded, dispatchReceptorsSafely };
