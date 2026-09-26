'use strict';

function quorumFor(input = {}) {
  const memberCount = Math.max(1, Number(input.memberCount) || 1);
  const faultyAssumed = Math.max(0, Number(input.faultyAssumed) || 0);
  const maxFaulty = Math.floor((memberCount - 1) / 3);
  const honorsAssumption = faultyAssumed <= maxFaulty;
  const effectiveFaulty = honorsAssumption ? faultyAssumed : maxFaulty;
  return {
    memberCount,
    faultyAssumed,
    maxFaulty,
    quorum: 2 * effectiveFaulty + 1,
    bftPossible: memberCount >= 3 * effectiveFaulty + 1,
    honorsAssumption
  };
}

function domainKey(member) {
  return [member.provider, member.lineage].map((value) => String(value || 'unknown')).join('|');
}

function partitionFaultDomains(input = {}) {
  const members = Array.isArray(input.members) ? input.members : [];
  const domains = new Map();
  for (const member of members) {
    const key = domainKey(member);
    if (!domains.has(key)) domains.set(key, []);
    domains.get(key).push(String(member.memberId || 'unknown'));
  }
  const quorum = quorumFor({ memberCount: members.length, faultyAssumed: Number(input.faultyAssumed) || 0 });
  const sizes = [...domains.values()].map((list) => list.length);
  const largest = sizes.length ? Math.max(...sizes) : 0;
  return {
    domains: [...domains.entries()].map(([domain, memberIds]) => ({ domain, memberIds, size: memberIds.length })),
    domainCount: domains.size,
    largestDomainSize: largest,
    singleDomainQuorum: largest >= quorum.quorum,
    warning: largest >= quorum.quorum ? 'A single fault domain can reach quorum alone.' : null
  };
}

function decayTrust(input = {}) {
  const trust = clamp01(Number(input.trust ?? 0.5));
  const periods = Math.max(0, Number(input.periodsMissed) || 0);
  const halfLife = Math.max(1, Number(input.halfLifePeriods) || 4);
  const decayed = trust * (0.5 ** (periods / halfLife));
  return { trust, periods, halfLife, decayedTrust: Number(decayed.toFixed(4)) };
}

function sybilEvidence(input) {
  const { member, members } = input;
  const peers = (Array.isArray(members) ? members : []).filter((peer) => peer.memberId !== member.memberId);
  const twins = peers.filter((peer) => peer.provider === member.provider
    && peer.lineage === member.lineage
    && JSON.stringify(peer.errorVector || null) === JSON.stringify(member.errorVector || null));
  return twins.map((peer) => peer.memberId);
}

function admitMember(input = {}) {
  const member = input.member || {};
  const flags = Array.isArray(input.signalFlags) ? input.signalFlags : [];
  const trust = decayTrust({ trust: input.trust, periodsMissed: input.periodsMissed });
  const twins = sybilEvidence({ member, members: input.members });
  if (twins.length) {
    return { verdict: 'REJECT', reason: 'SYBIL_TWIN_DETECTED', twins, trust: trust.decayedTrust };
  }
  if (flags.includes('HIGH_CONFIDENCE_WITHOUT_EVIDENCE') || flags.includes('INVALID_FORECAST_SIGNAL')) {
    return { verdict: 'QUARANTINE', reason: 'MALICIOUS_SIGNAL', flags, trust: trust.decayedTrust };
  }
  if (trust.decayedTrust < Number(input.minTrust ?? 0.2)) {
    return { verdict: 'QUARANTINE', reason: 'TRUST_BELOW_FLOOR', trust: trust.decayedTrust };
  }
  return { verdict: 'ADMIT', reason: 'CLEAR', trust: trust.decayedTrust };
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

module.exports = { quorumFor, partitionFaultDomains, decayTrust, admitMember };
