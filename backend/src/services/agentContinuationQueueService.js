'use strict';

const crypto = require('crypto');
const { buildContinuationContext } = require('../../bin/agent-runtime-prompt.cjs');
const { extractEvidenceReport } = require('./agentEvidenceService');
const { pendingContinuations } = require('./agentOrchestrationState');
const durableContinuation = require('./durableContinuationService');

function continuationTokens(continuation, index) {
  const scheduled = continuation.workerTokens;
  if (Array.isArray(scheduled) && scheduled[index] !== undefined) return scheduled[index];
  return continuation.perWorkerTokens;
}

function missionUsage(payload = {}) {
  const usage = payload.usage || {};
  return { events: Number(usage.events ?? payload.events ?? 1), cost: Number(usage.cost_usd ?? payload.cost_usd ?? 0) };
}

function missionBudget(previous = {}) {
  const budget = previous.executionBudget || {};
  return { events: Number(budget.events ?? 100), costUsd: Number(budget.costUsd ?? 1) };
}

function morphologyFor(survivor, adaptation) {
  const assignment = adaptation?.assignments?.[survivor.agentId];
  if (!assignment) return null;
  return { morphologyTopology: assignment.morphologyTopology, morphologyNodeId: assignment.morphologyNodeId,
    morphologyVariant: assignment.morphologyVariant, topologyRole: assignment.role,
    morphologyTransition: adaptation.receipt, strategyChallenge: assignment.strategyChallenge || null };
}

function morphologyPrompt(prompt, morphology, receipt) {
  const adaptation = `${prompt}\n\nMORPHOGENESIS ADAPTATION\nThe verified continuation policy rebound this worker to `
    + `${morphology.morphologyTopology}:${morphology.topologyRole}. Follow that topology role while preserving `
    + `the prior evidence lineage. Transition receipt: ${JSON.stringify(receipt)}.`;
  return morphology.strategyChallenge ? `${adaptation}\n\nSTRATEGY CHALLENGE\nTest this alternative hypothesis: `
    + `${morphology.strategyChallenge.hypothesis} Try to falsify it using the stated falsifier: `
    + `${morphology.strategyChallenge.falsifier}. Report source lineage and evidence references. `
    + `Your report is diagnostic and cannot resolve the mission without the independent verifier receipt.` : adaptation;
}

function prepareContinuation(context) {
  const { state, survivor, continuation, index, orchestratorId, adaptation, epoch } = context;
  const previous = state.workers.get(survivor.agentId);
  const tokens = continuationTokens(continuation, index);
  const report = extractEvidenceReport(survivor.payload) || {};
  const usage = missionUsage(survivor.payload);
  const budget = missionBudget(previous);
  const id = `cont_${crypto.randomUUID()}`;
  const morphology = morphologyFor(survivor, adaptation);
  const prompt = buildContinuationContext(previous, report, tokens);
  const mission = { ...previous, continuationId: id,
    prompt: morphology ? morphologyPrompt(prompt, morphology, adaptation.receipt) : prompt,
    executionBudget: { ...previous.executionBudget, tokens,
      events: Math.max(1, budget.events - usage.events), costUsd: Math.max(0, budget.costUsd - usage.cost) },
    budgetRound: { stage: Number.isInteger(epoch) ? 'morphogenesis_epoch' : 'continuation', epoch, orchestratorId,
      missionId: state.checkpointScope?.missionId || state.normalizedMission?.missionId || orchestratorId,
        organizationId: state.organizationId || null, projectId: state.projectId || null,
        epochBudgetSnapshot: continuation.epochBudgetSnapshot || null },
    ...(morphology || {}) };
  return { id, agentId: survivor.agentId, orchestratorId, mission,
    organizationId: state.organizationId, projectId: state.projectId };
}

async function queueContinuationMissions(contexts) {
  const prepared = contexts.map(prepareContinuation);
  if (!prepared.length) return [];
  await durableContinuation.persistContinuations({ db: contexts[0].state.db, continuations: prepared });
  for (const item of prepared) pendingContinuations.set(item.agentId, item.mission);
  return prepared.map((item) => item.agentId);
}

module.exports = { queueContinuationMissions };
