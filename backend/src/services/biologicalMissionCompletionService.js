'use strict';

const completionContract = require('./missionCompletionContract');
const completionEvidence = require('./missionCompletionEvidenceService');
const syncytiumCompletion = require('./syncytiumMissionCompletionService');

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

function memberId(member) {
  return member?.memberId || member?.workerId || null;
}

function topologyValidation(output) {
  return { status: output.complete ? 'verified' : 'partial',
    reasons: output.complete ? [] : ['worker_barrier_partial'], scope: 'worker_completion' };
}

function contractInput(context, evidence) {
  return { missionId: context.missionId || null, topology: context.mode,
    lifecycleState: 'completed', requiredMemberIds: evidence.members.map(memberId).filter(Boolean),
    members: evidence.members, evidenceProofs: evidence.evidenceProofs,
    topologyValidation: topologyValidation(context.output),
    barrierStatus: context.output.complete ? 'complete' : 'partial' };
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
  const result = completionContract.evaluate(contractInput(context, evidence));
  return applyContractResult(context.output, result);
}

async function complete(context) {
  if (context.mode === 'syncytium') return syncytiumCompletion.validateAndComplete(context);
  return completeNonSyncytium(context);
}

module.exports = { applyWorkerCompletion, complete };
