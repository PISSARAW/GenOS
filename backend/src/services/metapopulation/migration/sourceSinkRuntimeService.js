'use strict';
const { analyzeContribution } = require('../observability/regionalContributionService');

function buildSourceSinkProfile(demes, corridors) {
  const report = analyzeContribution(demes, corridors, {});
  const sources = [];
  const sinks = [];
  for (const d of report.demes) {
    if (d.type === 'SOURCE') sources.push({ demeId: d.demeId, capacity: capacityOf(d), contribution: d.regionalContribution });
    else if (d.type === 'SINK') sinks.push({ demeId: d.demeId, capacity: capacityOf(d), coverage: d.environmentalCoverage });
  }
  return { sources, sinks, report };
}

function capacityOf(deme) {
  const value = Number(deme.capacity ?? deme.fitness ?? 0.5);
  return Number.isFinite(value) ? Math.max(0, value) : 0.5;
}

function capacityAwareFlow(sourceSinkProfile, corridor, payloadSize) {
  const source = sourceSinkProfile.sources.find((s) => s.demeId === corridor.sourceDemeId);
  if (!source) return { allowed: false, reason: 'SOURCE_NOT_FOUND' };
  const remaining = source.capacity * (sourceSinkProfile.report?.sources?.[0]?.protectedFromLocalCull ? 0.8 : 1);
  const flow = Math.min(payloadSize, remaining);
  return { allowed: flow > 0, flow, remainingCapacity: source.capacity - flow, reason: flow > 0 ? 'FLOW_ALLOWED' : 'CAPACITY_EXHAUSTED' };
}

function detectSourceExhaustion(deme, history, threshold = 0.2) {
  const recent = history.slice(-3);
  if (recent.length < 2) return { exhausted: false };
  const trend = recent.map((h) => h.sourceCapacity || 1);
  const delta = trend[trend.length - 1] - trend[0];
  const exhausted = delta < 0 && trend[trend.length - 1] < threshold;
  return { exhausted, capacityTrend: delta, currentCapacity: recent[recent.length - 1], threshold };
}

function reassignTemporalRoles(demes, history) {
  const changes = [];
  for (const deme of demes || []) {
    const change = temporalRoleChange(deme, historyByDeme(history, deme.demeId));
    if (change) changes.push(change);
  }
  return { changes, rotated: changes.length };
}

function historyByDeme(history, demeId) {
  return (history || []).filter((entry) => entry.demeId === demeId).slice(-3);
}

function temporalRoleChange(deme, recent) {
  if (recent.length < 2) return null;
  const trend = recent.map((entry) => entry.sourceCapacity ?? 1);
  const current = trend[trend.length - 1];
  const delta = current - trend[0];
  if (deme.role === 'SOURCE' && delta < 0 && current < 0.2) return roleChange(deme, 'SINK', 'SOURCE_DEPLETED');
  if (deme.role === 'SINK' && delta > 0 && current > 0.7) return roleChange(deme, 'SOURCE', 'SINK_RECOVERED');
  return null;
}

function roleChange(deme, role, reason) {
  return { demeId: deme.demeId, from: deme.role || null, to: role, reason };
}

module.exports = { buildSourceSinkProfile, capacityAwareFlow, detectSourceExhaustion, reassignTemporalRoles };
