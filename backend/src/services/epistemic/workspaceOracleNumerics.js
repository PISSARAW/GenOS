'use strict';

const values = require('./workspaceOracleValues');

function mean(samples, strategy) {
  if (!samples.length) throw new Error('empty_numeric_sample');
  if (strategy === 'source_recompute') return samples.reduce((total, value) => total + value, 0) / samples.length;
  return samples.reduce((current, value, index) => current + (value - current) / (index + 1), 0);
}

function partition(subject, strategy, candidate) {
  const columns = subject.contract.columns;
  const rows = values.csv(values.source(subject));
  const jobs = new Map(rows.map(row => [row[columns.id], values.number(row[columns.duration])]));
  validateJobs(jobs, rows.length);
  const machines = candidate.machines;
  if (!Array.isArray(machines) || machines.length !== 2 || machines.some(m => !Array.isArray(m))) return false;
  const used = machines.flat();
  if (used.length !== jobs.size || new Set(used).size !== jobs.size || used.some(id => !jobs.has(id))) return false;
  const charges = machines.map(machine => machine.reduce((total, id) => total + jobs.get(id), 0));
  return values.fields(candidate, { charges, makespan: Math.max(...charges) })
    && candidate.makespan === optimum([...jobs.values()], strategy);
}

function validateJobs(jobs, size) {
  const durations = [...jobs.values()];
  if (jobs.size !== size || size < 1 || size > 16) throw new Error('partition_size_outside_domain');
  if (durations.some(n => !Number.isSafeInteger(n) || n < 0) || durations.reduce((a, b) => a + b, 0) > 1e6) {
    throw new Error('partition_duration_outside_domain');
  }
}

function optimum(durations, strategy) {
  const total = durations.reduce((a, b) => a + b, 0);
  if (strategy === 'source_recompute') return enumeratedOptimum(durations, total);
  let sums = new Set([0]);
  for (const duration of durations) sums = new Set([...sums, ...[...sums].map(sum => sum + duration)]);
  return Math.min(...[...sums].map(sum => Math.max(sum, total - sum)));
}

function enumeratedOptimum(durations, total) {
  let best = total;
  for (let mask = 0; mask < 2 ** durations.length; mask += 1) {
    let charge = 0;
    for (let i = 0; i < durations.length; i += 1) if (mask & (1 << i)) charge += durations[i];
    best = Math.min(best, Math.max(charge, total - charge));
  }
  return best;
}

function statistics(subject, strategy, candidate) {
  const key = subject.contract.columns.value;
  const samples = values.csv(values.source(subject)).filter(row => row[key]?.trim()).map(row => values.number(row[key]));
  if (!samples.length) throw new Error('empty_numeric_sample');
  const ordered = [...samples].sort((a, b) => a - b);
  const median = strategy === 'source_recompute' ? sortedMedian(ordered) : countedMedian(samples);
  return values.fields(candidate, { count: samples.length, total: samples.reduce((a, b) => a + b, 0),
    mean: mean(samples, strategy), median, max: ordered.at(-1) });
}

function sortedMedian(ordered) {
  return (ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.floor(ordered.length / 2)]) / 2;
}

function countedMedian(samples) {
  const counts = new Map();
  for (const value of samples) counts.set(value, (counts.get(value) || 0) + 1);
  const targets = [Math.floor((samples.length - 1) / 2), Math.floor(samples.length / 2)];
  let seen = 0;
  const selected = [];
  for (const [value, count] of [...counts].sort((a, b) => a[0] - b[0])) {
    for (const target of targets) if (target >= seen && target < seen + count) selected.push(value);
    seen += count;
  }
  return selected.reduce((a, b) => a + b, 0) / 2;
}

function pairedMeans(subject, strategy, candidate) {
  const rows = values.csv(values.source(subject, 'science'));
  const columns = subject.contract.columns;
  const before = mean(rows.map(r => values.number(r[columns.before])), strategy);
  const after = mean(rows.map(r => values.number(r[columns.after])), strategy);
  if (!values.fields(candidate, { beforeMean: before, afterMean: after, causalityEstablished: false })) return false;
  if (subject.contract.kind === 'publication_dossier') return true;
  if (before === 0) throw new Error('zero_initial_mean');
  return values.fields(candidate, { reduction: before - after, reductionPercent: 100 * (before - after) / before });
}

module.exports = { partition, statistics, pairedMeans, optimum };
