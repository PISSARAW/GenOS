/**
 * GenOS swarm proposal views and status transitions (swarmController module).
 *
 * Shared tally semantics with the collective primitives:
 * - abstentions count toward participation (totalVotes) but never toward the
 *   approval rate, which only uses yes/(yes+no) (or the weighted equivalent).
 * - an open proposal with zero active nodes and zero voters expires with
 *   reason 'no_active_nodes' instead of staying open forever.
 */
const qp = require('../services/primitiveHandlers/quorumPolicy');
const telemetry = require('../services/telemetryObserver');

function groupVotesByProposal(votes) {
  const grouped = {};
  if (!Array.isArray(votes)) return grouped;
  for (const vote of votes) {
    const key = vote.proposal_id;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(vote);
  }
  return grouped;
}

function votesForProposal(grouped, proposalId) {
  const list = grouped[proposalId];
  if (Array.isArray(list)) return list;
  return [];
}

function displayWeightOf(entry) {
  const raw = Number(entry.weight);
  if (Number.isFinite(raw)) return raw;
  return 1.0;
}

function toVoteView(entry) {
  return {
    agentId: entry.agent_id,
    agentName: entry.agent_name || entry.agent_id,
    vote: entry.vote,
    weight: displayWeightOf(entry),
    brierScore: entry.brier_score,
    reason: entry.reason
  };
}

function toVoteViews(votes) {
  const out = [];
  for (const entry of votes) out.push(toVoteView(entry));
  return out;
}

function approvalPercent(tally, weighted) {
  if (weighted) {
    const valid = tally.yesWeight + tally.noWeight;
    if (valid > 0) return Math.round((tally.yesWeight / valid) * 100);
    return 0;
  }
  const count = tally.yesCount + tally.noCount;
  if (count > 0) return Math.round((tally.yesCount / count) * 100);
  return 0;
}

function viewOfProposal(pack) {
  const proposal = pack.proposal;
  const weighted = proposal.consensus_type === 'brier_weighted';
  const tally = qp.tallySwarmVotes({ votes: pack.votes, weighted });
  return {
    id: proposal.id,
    workspaceId: proposal.workspace_id,
    title: proposal.title,
    description: proposal.description,
    status: proposal.status,
    consensusType: proposal.consensus_type || 'simple',
    proposer: proposal.proposer_name || 'Swarm Leader',
    quorumThreshold: qp.resolveThreshold(proposal.quorum_threshold),
    yesCount: tally.yesCount,
    noCount: tally.noCount,
    abstainCount: tally.abstainCount,
    yesWeight: tally.yesWeight,
    noWeight: tally.noWeight,
    totalVotes: tally.participationCount,
    approvalRate: approvalPercent(tally, weighted),
    votes: toVoteViews(pack.votes)
  };
}

function buildViews(pack) {
  const grouped = groupVotesByProposal(pack.votes);
  const out = [];
  for (const proposal of pack.proposals) {
    out.push(viewOfProposal({ proposal, votes: votesForProposal(grouped, proposal.id) }));
  }
  return out;
}

function statusSpecOf(view, activeCount) {
  const weighted = view.consensusType === 'brier_weighted';
  let yes = view.yesCount;
  let no = view.noCount;
  if (weighted) {
    yes = view.yesWeight;
    no = view.noWeight;
  }
  return {
    yes,
    no,
    participation: view.totalVotes,
    active: activeCount,
    threshold: view.quorumThreshold
  };
}

function emitStatusTelemetry(change) {
  telemetry.emitEvent({
    eventType: 'QUORUM_PROPOSAL_STATUS',
    agentId: 'swarm_controller',
    action: 'PROPOSAL_STATUS',
    detail: 'Proposal ' + change.id + ' moved to ' + change.status + ' (' + change.reason + ')',
    severity: 'info',
    payload: { proposalId: change.id, status: change.status, reason: change.reason }
  });
}

async function refreshProposalStatus(pack) {
  const view = pack.view;
  if (view.status !== 'open') return null;
  const outcome = qp.resolveProposalStatus(statusSpecOf(view, pack.activeCount));
  if (outcome.status === 'open' || outcome.status === view.status) return null;
  await pack.db.run('UPDATE swarm_proposals SET status = ? WHERE id = ?', outcome.status, view.id);
  view.status = outcome.status;
  const change = { id: view.id, status: outcome.status, reason: outcome.reason };
  emitStatusTelemetry(change);
  return change;
}

function summarizeConsensus(proposals) {
  if (!Array.isArray(proposals) || proposals.length === 0) return 'No quorum proposal';
  const latest = proposals[0];
  const votes = Number(latest.totalVotes);
  let suffix = 's';
  if (votes === 1) suffix = '';
  return latest.approvalRate + '% approval · ' + votes + ' vote' + suffix;
}

module.exports = {
  viewOfProposal,
  buildViews,
  refreshProposalStatus,
  summarizeConsensus
};
