'use strict';

const METRICS = Object.freeze(['evidenceStrength', 'novelty', 'coverage', 'leanProgress', 'costEfficiency']);

function bounded(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function metricVector(lineage) {
  return METRICS.map((key) => bounded(lineage.metrics?.[key]));
}

function dominates(left, right) {
  const a = metricVector(left);
  const b = metricVector(right);
  return a.every((value, index) => value >= b[index]) && a.some((value, index) => value > b[index]);
}

function partitionPareto(lineages = []) {
  const dominated = [];
  const front = [];
  for (const candidate of lineages) {
    if (lineages.some((other) => other.lineageId !== candidate.lineageId && dominates(other, candidate))) dominated.push(candidate);
    else front.push(candidate);
  }
  return { front, dominated };
}

function promiseScore(lineage) {
  const vector = metricVector(lineage);
  return vector.reduce((sum, value) => sum + value, 0) || 1;
}

function donorEntries(dominated, minimumBudget) {
  return dominated.map((lineage) => {
    const budget = Math.max(0, Math.floor(Number(lineage.budget) || 0));
    const floor = Math.min(budget, Math.max(0, Math.floor(minimumBudget)));
    return { lineageId: lineage.lineageId, available: budget - floor };
  }).filter((entry) => entry.available > 0);
}

function recipientTargets(front, pool) {
  const ordered = [...front].sort((left, right) => String(left.lineageId).localeCompare(String(right.lineageId)));
  const totalWeight = ordered.reduce((sum, lineage) => sum + promiseScore(lineage), 0);
  const targets = ordered.map((lineage) => ({
    lineageId: lineage.lineageId,
    tokens: Math.floor(pool * promiseScore(lineage) / totalWeight),
  }));
  let remainder = pool - targets.reduce((sum, item) => sum + item.tokens, 0);
  for (const target of targets) {
    if (!remainder) break;
    target.tokens += 1;
    remainder -= 1;
  }
  return targets;
}

function buildTransfers(donors, targets) {
  const transfers = [];
  let donorIndex = 0;
  for (const target of targets) {
    let needed = target.tokens;
    while (needed > 0 && donorIndex < donors.length) {
      const donor = donors[donorIndex];
      const tokens = Math.min(needed, donor.available);
      transfers.push({ fromLineageId: donor.lineageId, toLineageId: target.lineageId, tokens, reason: 'pareto_reallocation' });
      needed -= tokens;
      donor.available -= tokens;
      if (!donor.available) donorIndex += 1;
    }
  }
  return transfers;
}

function applyTransfers(lineages, transfers) {
  const budgets = new Map(lineages.map((lineage) => [lineage.lineageId, Math.max(0, Math.floor(Number(lineage.budget) || 0))]));
  for (const transfer of transfers) {
    budgets.set(transfer.fromLineageId, budgets.get(transfer.fromLineageId) - transfer.tokens);
    budgets.set(transfer.toLineageId, budgets.get(transfer.toLineageId) + transfer.tokens);
  }
  return [...budgets].map(([lineageId, budget]) => ({ lineageId, budget }));
}

function reallocateLineageBudget(input = {}) {
  const lineages = input.lineages || [];
  const ids = new Set(lineages.map((lineage) => lineage.lineageId));
  if (ids.size !== lineages.length) throw new Error('lineageId values must be unique.');
  const { front, dominated } = partitionPareto(lineages);
  const donors = donorEntries(dominated, Number(input.minimumBudget) || 0);
  const pool = donors.reduce((sum, donor) => sum + donor.available, 0);
  const targets = recipientTargets(front, pool);
  const transfers = buildTransfers(donors, targets);
  return {
    paretoFrontIds: front.map((item) => item.lineageId).sort(),
    dominatedIds: dominated.map((item) => item.lineageId).sort(),
    allocations: applyTransfers(lineages, transfers),
    transfers,
    conservedTokens: lineages.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.budget) || 0)), 0),
  };
}

module.exports = { METRICS, dominates, partitionPareto, reallocateLineageBudget };
