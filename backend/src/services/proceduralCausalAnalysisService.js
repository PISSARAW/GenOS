'use strict';

const crypto = require('node:crypto');
const { ensureSchema, loadExperiment } = require('./proceduralCausalExperimentService');

function validateGroups(groups) {
  if (!Array.isArray(groups) || groups.length < 2) throw new Error('At least two independent snapshots are required.');
  const ids = groups.map((group) => group.snapshotId);
  if (ids.some((value) => typeof value !== 'string' || !value.trim()) || new Set(ids).size !== ids.length) {
    throw new Error('Snapshot identities must be non-empty and distinct.');
  }
  for (const group of groups) {
    if (!Array.isArray(group.differences) || !group.differences.length
      || group.differences.some((value) => !Number.isFinite(value))) {
      throw new Error(`Snapshot '${group.snapshotId}' needs finite paired differences.`);
    }
  }
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function sample(values, random) {
  return Array.from({ length: values.length }, () => values[Math.floor(random() * values.length)]);
}

function bootstrapDistribution(groups, replicates, random) {
  const estimates = [];
  for (let iteration = 0; iteration < replicates; iteration += 1) {
    const sampledGroups = sample(groups, random);
    estimates.push(mean(sampledGroups.map((group) => mean(sample(group.differences, random)))));
  }
  return estimates.sort((left, right) => left - right);
}

function percentile(sorted, fraction) {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * sorted.length)));
  return sorted[index];
}

function perSnapshot(groups) {
  return groups.map((group) => ({ snapshotId: group.snapshotId, pairCount: group.differences.length,
    meanDifference: mean(group.differences) }));
}

function analyzeSnapshots(input) {
  validateGroups(input.groups);
  const replicates = input.bootstrapReplicates || 10000;
  if (!Number.isSafeInteger(replicates) || replicates < 1000 || replicates > 100000) {
    throw new Error('Bootstrap replicates must be between 1000 and 100000.');
  }
  if (!Number.isSafeInteger(input.analysisSeed)) throw new Error('A declared integer analysisSeed is required.');
  const random = createRandom(input.analysisSeed);
  const distribution = bootstrapDistribution(input.groups, replicates, random);
  const snapshotResults = perSnapshot(input.groups);
  const estimate = mean(snapshotResults.map((result) => result.meanDifference));
  const interval = { lower: percentile(distribution, 0.025), upper: percentile(distribution, 0.975) };
  const verdict = interval.lower > 0 ? 'supported_improvement'
    : (interval.upper < 0 ? 'supported_regression' : 'inconclusive');
  return {
    schema: 'genos.procedural-causal-analysis/v1', snapshotCount: input.groups.length,
    snapshots: snapshotResults, aggregateMeanDifference: estimate, confidenceInterval95: interval,
    verdict, analysis: { method: 'hierarchical-paired-bootstrap_percentile_95',
      bootstrapReplicates: replicates, analysisSeed: input.analysisSeed,
      grouping: 'resample-snapshots-then-paired-seeds', weighting: 'equal-per-snapshot' },
    attributionScope: 'declared-snapshots-runner-environment-budget-and-paired-seeds',
  };
}

async function persistSnapshotAnalysis(db, input) {
  return require('../db').withTransaction(db, () => persistBoundAnalysis(db, input));
}

async function persistBoundAnalysis(db, input) {
  await ensureSchema(db);
  await db.exec(`CREATE TABLE IF NOT EXISTS procedural_causal_diffs (
    diff_id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, baseline_fork_id TEXT NOT NULL,
    intervention_fork_id TEXT NOT NULL, diff_hash TEXT NOT NULL, diff_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(baseline_fork_id, intervention_fork_id)
  );`);
  const experiment = await loadExperiment(db, input.experimentId);
  if (!experiment) throw new Error('Unknown causal experiment for snapshot analysis.');
  const protocol = require('./pairedReplayProtocol');
  protocol.verify(experiment, input);
  const pinnedSnapshots = new Set(JSON.parse(experiment.snapshot_refs_json));
  const groups = await loadPairedDifferences(db, { ...input, pairedReplayRequired: protocol.enabled(experiment) }, pinnedSnapshots);
  const evidenceRefs = groups.flatMap((group) => group.diffIds.map((diffId) => `diff:${diffId}`));
  const analysis = { ...analyzeSnapshots({ ...input, groups }), evidenceRefs };
  if (protocol.enabled(experiment)) analysis.replayControls = require('./pairedReplayConsumer').metadata(experiment);
  const payload = JSON.stringify(analysis);
  const analysisHash = crypto.createHash('sha256').update(payload).digest('hex');
  const analysisId = `causal_analysis_${analysisHash.slice(0, 24)}`;
  await db.exec(`CREATE TABLE IF NOT EXISTS procedural_causal_analyses (
    analysis_id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL,
    analysis_hash TEXT NOT NULL, payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(experiment_id, analysis_hash)
  );`);
  await db.run(`INSERT OR IGNORE INTO procedural_causal_analyses
    (analysis_id, experiment_id, analysis_hash, payload_json) VALUES (?, ?, ?, ?)`,
  [analysisId, input.experimentId, analysisHash, payload]);
  return { analysisId, analysisHash, ...analysis };
}

async function loadPairedDifferences(db, input, pinnedSnapshots) {
  if (!Array.isArray(input.groups)) throw new Error('Snapshot groups are required.');
  const groups = [];
  for (const group of input.groups) {
    if (!pinnedSnapshots.has(group.snapshotId) || !Array.isArray(group.diffIds)) {
      throw new Error('Analysis groups must reference pinned snapshots and persisted diffs.');
    }
    const differences = [];
    for (const diffId of group.diffIds) {
      differences.push(await loadDifference(db, input, { diffId, snapshotId: group.snapshotId }));
    }
    groups.push({ snapshotId: group.snapshotId, differences, diffIds: [...group.diffIds] });
  }
  return groups;
}

async function loadDifference(db, input, { diffId, snapshotId }) {
  const row = await db.get('SELECT * FROM procedural_causal_diffs WHERE diff_id = ? AND experiment_id = ?', [diffId, input.experimentId]);
  const diff = row && JSON.parse(row.diff_json);
  if (!diff || diff.snapshotId !== snapshotId || !Number.isFinite(diff.scoreDelta)) {
    throw new Error(`Invalid paired causal diff '${diffId}' for snapshot '${snapshotId}'.`);
  }
  if (input.pairedReplayRequired) await require('./pairedReplayConsumer').currentDiff(db, row, input);
  return diff.scoreDelta;
}

module.exports = { analyzeSnapshots, persistSnapshotAnalysis };
