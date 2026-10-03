'use strict';

function memberKey(member, index) {
  return String(member.memberId || `member_${index}`);
}

function localKey(member) {
  return [member.expertise, member.provider, member.lineage].map((value) => String(value || 'unknown')).join('|');
}

function composeSubCouncils(input = {}) {
  const members = Array.isArray(input.members) ? input.members : [];
  if (!members.length) throw councilError('BIOCENOSE_COUNCIL_NO_MEMBERS', 'Polycentric council requires at least one member.');
  const councilCount = Math.max(1, Math.min(Number(input.councilCount) || 2, members.length));
  const buckets = Array.from({ length: councilCount }, (_, index) => []);
  const ordered = [...members].sort((left, right) => localKey(left).localeCompare(localKey(right)));
  ordered.forEach((member, index) => buckets[index % councilCount].push(member));
  return buckets.map((bucket, index) => ({
    councilId: `council_${index + 1}`,
    scope: input.scope || 'local',
    charter: input.charter || { subsidiarity: true, dissentPreserved: true },
    memberIds: bucket.map(memberKey),
    size: bucket.length
  }));
}

function delegateFor(cluster, count) {
  const distribution = Array.isArray(cluster.distribution) ? cluster.distribution : [];
  const delegates = [...distribution].sort((left, right) => Number(right.share) - Number(left.share)
    || String(left.position).localeCompare(String(right.position))).slice(0, Math.max(1, count)).map((item) => ({
    position: item.position, share: item.share, memberCount: item.memberCount
  }));
  return {
    clusterId: cluster.clusterId,
    outcome: cluster.outcome,
    delegates,
    dissent: Array.isArray(cluster.dissent) ? [...cluster.dissent] : [],
    minorityBypass: Array.isArray(cluster.minorityEvidenceBypass) ? [...cluster.minorityEvidenceBypass] : []
  };
}

function federate(input = {}) {
  const clusters = Array.isArray(input.clusters) ? input.clusters : [];
  if (!clusters.length) throw councilError('BIOCENOSE_COUNCIL_NO_CLUSTERS', 'Federation requires at least one cluster outcome.');
  const delegatesPerCluster = Math.max(1, Number(input.delegatesPerCluster) || 1);
  const delegations = clusters.map((cluster) => delegateFor(cluster, delegatesPerCluster));
  const outcomes = new Set(delegations.map((item) => item.outcome));
  const bypasses = delegations.flatMap((item) => item.minorityBypass);
  const localMatters = delegations.filter((item) => item.dissent.length === 0 && item.minorityBypass.length === 0);
  return {
    status: outcomes.size > 1 ? 'FEDERATED_PLURALISM' : 'FEDERATED_CONSENSUS',
    delegations,
    subsidiarity: {
      localRetained: localMatters.map((item) => item.clusterId),
      escalated: delegations.filter((item) => !localMatters.includes(item)).map((item) => item.clusterId)
    },
    minorityBypass: bypasses,
    parentMustReview: bypasses.length > 0 || outcomes.size > 1
  };
}

function aggregateSubCouncils(input = {}) {
  const councils = Array.isArray(input.councils) ? input.councils : [];
  const judgments = Array.isArray(input.judgments) ? input.judgments : [];
  return councils.map((council) => summarizeCouncil(council, judgments));
}

function summarizeCouncil(council, judgments) {
  const members = new Set(council.memberIds);
  const positions = judgments.filter((item) => members.has(item.memberId))
    .map((item) => item.judgment?.position).filter((value) => value !== undefined && value !== null)
    .map(String);
  const counts = new Map();
  for (const position of positions) counts.set(position, (counts.get(position) || 0) + 1);
  const distribution = [...counts].map(([position, memberCount]) => ({
    position, memberCount, share: positions.length ? memberCount / positions.length : 0
  })).sort((left, right) => right.share - left.share || left.position.localeCompare(right.position));
  return { clusterId: council.councilId, outcome: distribution[0]?.position || 'UNRESOLVED',
    distribution, dissent: distribution.slice(1).map((item) => ({ ...item, critical: false })) };
}

function councilError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { composeSubCouncils, aggregateSubCouncils, federate };
