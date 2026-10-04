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
  const ordered = [...members].sort((left, right) => localKey(left).localeCompare(localKey(right)));
  const buckets = input.specializeByExpertise ? expertiseBuckets(ordered) : roundRobinBuckets(ordered, councilCount);
  return buckets.map((entry, index) => ({
    councilId: `council_${index + 1}`,
    scope: entry.scope || input.scope || 'local',
    charter: input.charter || { subsidiarity: true, dissentPreserved: true },
    memberIds: entry.members.map(memberKey),
    size: entry.members.length
  }));
}

function roundRobinBuckets(members, count) {
  const buckets = Array.from({ length: count }, () => []);
  members.forEach((member, index) => buckets[index % count].push(member));
  return buckets.map((value) => ({ members: value }));
}

function expertiseBuckets(members) {
  const grouped = new Map();
  for (const member of members) {
    const expertise = String(member.expertise || 'general');
    if (!grouped.has(expertise)) grouped.set(expertise, []);
    grouped.get(expertise).push(member);
  }
  return [...grouped].map(([scope, value]) => ({ scope, members: value }));
}

function delegateFor(cluster, count) {
  const distribution = Array.isArray(cluster.distribution) ? cluster.distribution : [];
  const delegates = distribution.slice(0, Math.max(1, count)).map((item) => ({
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
  const conflicts = outcomes.size > 1 ? new Set(delegations.map((item) => item.clusterId)) : new Set();
  const localMatters = delegations.filter((item) => item.minorityBypass.length === 0
    && !conflicts.has(item.clusterId));
  return {
    status: outcomes.size > 1 ? 'FEDERATED_PLURALISM' : 'FEDERATED_CONSENSUS',
    delegations,
    subsidiarity: {
      localRetained: localMatters.map((item) => item.clusterId),
      escalated: delegations.filter((item) => !localMatters.includes(item)).map((item) => item.clusterId),
      outcomeConflicts: [...conflicts]
    },
    minorityBypass: bypasses,
    parentMustReview: bypasses.length > 0 || outcomes.size > 1
  };
}

function councilError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { composeSubCouncils, federate };
