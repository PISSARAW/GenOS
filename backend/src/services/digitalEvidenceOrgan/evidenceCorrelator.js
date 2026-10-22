'use strict';

const { canonicalDigest } = require('./deoContract');
const { canonicalValue } = require('../stateFingerprint');

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

function groupByPivot(observations, pivotKey, extractor) {
  const buckets = new Map();
  for (const obs of observations) {
    const val = extractor(obs);
    if (!val) continue;
    if (!buckets.has(val)) buckets.set(val, []);
    buckets.get(val).push(obs);
  }
  const clusters = [];
  for (const [value, members] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (members.length < 2) continue;
    const sorted = [...members].sort((a, b) => a.epochMs - b.epochMs);
    const body = canonicalValue({
      pivotType: pivotKey,
      pivotValue: value,
      observationIds: sorted.map((m) => m.observationId),
      artifactIds: [...new Set(sorted.map((m) => m.artifactId))].sort(),
      formats: [...new Set(sorted.map((m) => m.sourceFormat))].sort(),
      firstSeenAt: sorted[0].occurredAt,
      lastSeenAt: sorted[sorted.length - 1].occurredAt,
    });
    clusters.push({
      ...body,
      clusterId: `corr:${pivotKey}:${canonicalDigest(body).slice(7, 19)}`,
    });
  }
  return clusters;
}

function correlateByTimeWindow(observations, windowMs = DEFAULT_WINDOW_MS) {
  if (observations.length < 2) return [];
  const sorted = [...observations].sort((a, b) => a.epochMs - b.epochMs);
  const windows = [];
  let currentGroup = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    if (sorted[i].epochMs - prev.epochMs <= windowMs) {
      currentGroup.push(sorted[i]);
    } else {
      if (currentGroup.length >= 2) windows.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }
  if (currentGroup.length >= 2) windows.push(currentGroup);

  return windows.map((group) => {
    const body = canonicalValue({
      pivotType: 'period',
      windowMs,
      observationIds: group.map((m) => m.observationId),
      artifactIds: [...new Set(group.map((m) => m.artifactId))].sort(),
      firstSeenAt: group[0].occurredAt,
      lastSeenAt: group[group.length - 1].occurredAt,
    });
    return {
      ...body,
      clusterId: `corr:period:${canonicalDigest(body).slice(7, 19)}`,
    };
  });
}

function correlateObservations(observations = [], options = {}) {
  const windowMs = Number.isFinite(options.windowMs) && options.windowMs > 0
    ? options.windowMs
    : DEFAULT_WINDOW_MS;

  const byHost = groupByPivot(observations, 'host', (o) => o.subject?.host);
  const byUser = groupByPivot(observations, 'user', (o) => o.subject?.user);
  const byProcess = groupByPivot(observations, 'process', (o) => o.subject?.process);
  const byPeriod = correlateByTimeWindow(observations, windowMs);

  const allClusters = [...byHost, ...byUser, ...byProcess, ...byPeriod];
  return Object.freeze({
    totalObservations: observations.length,
    windowMs,
    byHost,
    byUser,
    byProcess,
    byPeriod,
    clusters: allClusters,
  });
}

module.exports = {
  DEFAULT_WINDOW_MS,
  correlateObservations,
};
