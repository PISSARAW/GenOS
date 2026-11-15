'use strict';

const biocenose = require('../../biocenoseService.js');

function expectedWorkers(composition) {
  return (composition?.members || []).filter((member) => member.executionMode !== 'orchestrator');
}

function verifiedWorker(member) {
  return member?.status === 'completed' && Boolean(member.executionRunId)
    && member.result?.status === 'completed' && member.result?.verified === true;
}

function workerBarrier(input, expected) {
  const accepted = input.accepted || [];
  return expected.length > 0 && accepted.length === expected.length
    && accepted.every(verifiedWorker)
    && !(input.context?.dispatchFailures || []).length;
}

function contribution(member) {
  return {
    workerId: member.workerId,
    executionRunId: member.executionRunId,
    role: member.role,
    answer: member.result.answer,
    outcome: member.result.outcome || null,
    evidenceEventId: member.result.evidenceEventId || null
  };
}

function workerContributions(expected, accepted) {
  return Object.fromEntries(expected.map((member, index) => [
    member.memberId || member.id || `${member.role}:${member.memberNumber || index + 1}`,
    contribution(accepted[index])
  ]));
}

function runtimeDependencies(context) {
  const supplied = context?.biocenoseRuntimeDependencies || {};
  return Object.fromEntries(['memberInvoker', 'verificationExecutor', 'isTrustedReceipt']
    .filter((name) => typeof supplied[name] === 'function')
    .map((name) => [name, supplied[name]]));
}

async function apply(input = {}) {
  const expected = expectedWorkers(input.composition);
  if (!workerBarrier(input, expected)) {
    return { applied: false, status: 'BLOCKED',
      reason: 'BIOCENOSE_VERIFIED_WORKER_EVIDENCE_REQUIRED' };
  }
  const communityId = input.topology?.communityId || input.topology?.sessionId
    || input.composition?.communityId;
  if (!communityId) {
    return { applied: false, status: 'BLOCKED', reason: 'BIOCENOSE_COMMUNITY_REQUIRED' };
  }
  const contributions = workerContributions(expected, input.accepted);
  const result = await biocenose.runBiocenoseRound({
    db: input.db, communityId, actorId: input.context?.orchestratorId,
    workerContributions: contributions, ...runtimeDependencies(input.context)
  });
  return { communityId, round: result.round, deliberationStatus: result.status,
    followUpStatus: result.followUpStatus, contributionCount: Object.keys(contributions).length };
}

module.exports = { apply, workerBarrier, workerContributions };
