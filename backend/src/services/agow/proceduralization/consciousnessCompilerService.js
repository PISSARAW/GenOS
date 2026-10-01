'use strict';

const trajectories = require('./cognitiveTrajectoryService');
const consolidation = require('../../proceduralConsolidationService');

function toEpisode(trajectory) {
  return { id: trajectory.trajectoryId, trajectory: trajectory.stepRefs, success: trajectory.success,
    outcome: trajectory.success ? 'success' : 'failure', context: trajectory.context,
    sourceEpisodeIds: trajectory.outcomeRefs };
}

function proposalFrom(result, episodes, contextHash) {
  if (!result.consolidated) return { proposed: false, reason: result.reason, count: result.count || episodes.length };
  return { proposed: true, promotionRequested: false, status: 'proposal_only', pathway: result,
    contextHash, provenance: { trajectoryIds: episodes.map((item) => item.id), evidenceRefs: episodes.flatMap((item) => item.evidenceRefs || []) } };
}

function compileTrajectories(input) {
  const episodes = input.trajectories.map(toEpisode);
  const result = consolidation.consolidatePath(input.policy || {}, episodes);
  return proposalFrom(result, input.trajectories, input.contextHash || '*');
}

async function compile(options) {
  if (!options?.agentId) throw new TypeError('Compiler requires an agent id.');
  const recorded = await trajectories.list(options);
  const context = options.contextHash ? recorded.filter((item) => item.context?.signature === options.contextHash) : recorded;
  if (context.some((item) => item.success && !item.evidenceRefs.length)) {
    return { proposed: false, reason: 'successful_trajectory_without_evidence' };
  }
  return compileTrajectories({ trajectories: context, policy: options.policy, contextHash: options.contextHash });
}

module.exports = { compile, compileTrajectories, toEpisode };
