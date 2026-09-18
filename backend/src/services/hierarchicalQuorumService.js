'use strict';

function planForAgentCount(agentCount, options = {}) {
  const count = Math.max(1, Number(agentCount) || 1);
  const clusterSize = Math.max(2, Number(options.clusterSize) || 10);
  const clusterCount = Math.ceil(count / clusterSize);
  return {
    agentCount: count,
    clusterSize,
    clusterCount,
    fanout: Math.max(1, Math.min(3, Number(options.fanout) || 2)),
    levels: clusterCount > 1 ? 2 : 1,
    strategy: clusterCount > 1 ? 'local_quorum_then_global_quorum' : 'local_quorum'
  };
}

function voteCounts(votes) {
  const counts = new Map();
  for (const vote of Array.isArray(votes) ? votes : []) {
    const value = String(vote?.value || '').trim();
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function topVote(counts) {
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
}

function summarizeVotes(votes, options = {}) {
  const list = Array.isArray(votes) ? votes : [];
  const threshold = Math.max(0.5, Math.min(1, Number(options.threshold) || 0.67));
  const winner = topVote(voteCounts(list));
  const participation = list.length ? (winner?.[1] || 0) / list.length : 0;
  return {
    reached: Boolean(winner && participation >= threshold),
    value: winner?.[0] || null,
    participation: Number(participation.toFixed(3)),
    threshold,
    participantCount: list.length
  };
}

function reduceClusterVotes(clusterVotes, options = {}) {
  const summaries = (Array.isArray(clusterVotes) ? clusterVotes : []).filter(Boolean);
  return summarizeVotes(summaries.map((summary) => ({ value: summary.value })), options);
}

module.exports = { planForAgentCount, summarizeVotes, reduceClusterVotes };
