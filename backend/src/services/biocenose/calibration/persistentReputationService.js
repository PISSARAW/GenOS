'use strict';

function decayReputation(input = {}) {
  const reputation = clamp01(Number(input.reputation ?? 0.5));
  const periods = Math.max(0, Number(input.periodsElapsed) || 0);
  const halfLife = Math.max(1, Number(input.halfLifeMissions) || 6);
  const decayed = 0.5 + (reputation - 0.5) * (0.5 ** (periods / halfLife));
  return { reputation, periods, halfLife, decayedReputation: Number(decayed.toFixed(4)) };
}

function domainReputation(input = {}) {
  const records = Array.isArray(input.records) ? input.records : [];
  const byDomain = new Map();
  for (const record of records) {
    const domain = String(record.domain || 'general');
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    if (Number.isFinite(Number(record.brierScore))) byDomain.get(domain).push(Number(record.brierScore));
  }
  const domains = [...byDomain.entries()].map(([domain, scores]) => ({
    domain,
    sampleCount: scores.length,
    meanBrier: scores.length ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(4)) : null,
    reputation: scores.length ? Number((1 - scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(4)) : null
  }));
  return { memberId: input.memberId || null, domains };
}

function membershipDecision(input = {}) {
  const reputation = clamp01(Number(input.reputation ?? 0.5));
  const sampleCount = Math.max(0, Number(input.sampleCount) || 0);
  const minSample = Math.max(1, Number(input.minSample) || 3);
  const expelBelow = clamp01(Number(input.expelBelow ?? 0.25));
  const probationBelow = clamp01(Number(input.probationBelow ?? 0.45));
  if (sampleCount < minSample) return { decision: 'PROBATION', reason: 'INSUFFICIENT_HISTORY', reputation, sampleCount };
  if (reputation < expelBelow) return { decision: 'EXPEL', reason: 'REPUTATION_BELOW_FLOOR', reputation, sampleCount };
  if (reputation < probationBelow) return { decision: 'PROBATION', reason: 'REPUTATION_BELOW_BAR', reputation, sampleCount };
  return { decision: 'RETAIN', reason: 'REPUTATION_SUFFICIENT', reputation, sampleCount };
}

function antiEntrenchment(input = {}) {
  const tenures = Array.isArray(input.tenures) ? input.tenures : [];
  const maxTenure = Math.max(1, Number(input.maxTenureMissions) || 5);
  const rotate = [];
  const retain = [];
  for (const tenure of tenures) {
    const missions = Math.max(0, Number(tenure.missions) || 0);
    if (missions >= maxTenure) rotate.push({ memberId: tenure.memberId, missions, action: 'ROTATE' });
    else retain.push({ memberId: tenure.memberId, missions, action: 'RETAIN' });
  }
  return { rotate, retain, maxTenure, rotationDue: rotate.length > 0 };
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

module.exports = { decayReputation, domainReputation, membershipDecision, antiEntrenchment };
