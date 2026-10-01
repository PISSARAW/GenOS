'use strict';

const episodeStore = require('../../autobiographicalMemory/episodeStore');

function refs(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value.length))].slice(0, 200);
}

function present(value) {
  return value || null;
}

function episodeFromTrajectory(input) {
  const trajectory = input.trajectory;
  return { agentId: input.agentId, missionId: present(input.missionId), kind: 'agow_causal_trajectory', salience: input.salience ?? 0.7,
    situation: { goal: present(input.goal), frameIds: refs([trajectory.frameId]), context: input.context || {} },
    decision: { winningCandidates: refs(input.winningCandidateRefs), losingCandidates: refs(input.losingCandidateRefs), activeQueries: refs(trajectory.queryRefs) },
    action: { selectedAction: present(input.selectedAction), candidateRefs: refs(trajectory.candidateRefs) },
    outcome: { predictedOutcome: present(input.predictedOutcome), observedOutcome: present(input.observedOutcome),
      success: trajectory.success, outcomeRefs: refs(trajectory.outcomeRefs), evidenceRefs: refs(trajectory.evidenceRefs) },
    lesson: { selfWorldAttribution: present(input.selfWorldAttribution),
      counterfactualRefs: refs(input.counterfactualRefs), marketReceiptRefs: refs(input.marketReceiptRefs),
      proceduralizationEvent: present(input.proceduralizationEvent), decompilationEvent: present(input.decompilationEvent) }
  };
}

async function capture(input) {
  return episodeStore.recordEpisode(episodeFromTrajectory(input), input.db);
}

module.exports = { capture, episodeFromTrajectory, refs };
