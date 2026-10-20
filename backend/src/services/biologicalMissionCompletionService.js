'use strict';

const completionEvidence = require('./missionCompletionEvidenceService');
const syncytiumCompletion = require('./syncytiumMissionCompletionService');
const { closeMission } = require('./missionClosureService');
const completionAdapters = require('./topologyCompletionAdapters');

function outputMembers(output) {
  return Array.isArray(output.members) ? output.members : [];
}

function workerBarrierComplete(output, expectedCount, candidates = outputMembers(output)) {
  return Number.isInteger(expectedCount) && expectedCount > 0
    && output.status === 'completed' && output.complete !== false
    && candidates.length === expectedCount
    && candidates.every((member) => member.status === 'completed')
    && !(output.dispatchFailures || []).length;
}

function applyWorkerCompletion(output, expectedCount, candidates = outputMembers(output)) {
  output.complete = workerBarrierComplete(output, expectedCount, candidates);
  output.status = output.complete ? 'completed' : 'partial';
  return output;
}

function applyContractResult(output, result) {
  output.completionContract = result;
  output.complete = result.verdict === 'succeeded';
  output.success = result.success;
  output.status = output.complete ? 'completed' : result.verdict === 'failed' ? 'failed' : 'partial';
  return output;
}

async function completeNonSyncytium(context) {
  const candidates = context.mode === 'rhizome' && Array.isArray(context.output.branches)
    ? context.output.branches : outputMembers(context.output);
  const expectedCount = context.mode === 'rhizome' ? candidates.length : context.expectedCount;
  applyWorkerCompletion(context.output, expectedCount, candidates);
  const evidence = await completionEvidence.collect({ db: context.db, missionId: context.missionId,
    members: candidates, evidenceProofs: context.evidenceProofs });
  const registry = context.completionAdapterRegistry || completionAdapters;
  const input = await registry.build({ context, evidence });
  const result = closeMission(input);
  return applyContractResult(context.output, result);
}

async function complete(context) {
  if (context.mode === 'syncytium') return syncytiumCompletion.validateAndComplete(context);
  return completeNonSyncytium(context);
}

module.exports = { applyWorkerCompletion, complete };
