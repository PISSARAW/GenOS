'use strict';

const { digest, ensureSchema, loadFork, checkpointFork } = require('./proceduralCausalExperimentService');

async function ensureDiffSchema(db) {
  await ensureSchema(db);
  await db.exec(`CREATE TABLE IF NOT EXISTS procedural_causal_diffs (
    diff_id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL,
    baseline_fork_id TEXT NOT NULL, intervention_fork_id TEXT NOT NULL,
    diff_hash TEXT NOT NULL, diff_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(baseline_fork_id, intervention_fork_id)
  );`);
}

function compareTrajectories(baseline, intervention) {
  const left = Array.isArray(baseline) ? baseline : [];
  const right = Array.isArray(intervention) ? intervention : [];
  const divergences = [];
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    const leftHash = index < left.length ? digest(left[index]) : null;
    const rightHash = index < right.length ? digest(right[index]) : null;
    if (leftHash !== rightHash) {
      divergences.push({ stepIndex: index, baselinePresent: index < left.length, interventionPresent: index < right.length,
        baselineHash: leftHash, interventionHash: rightHash });
    }
  }
  return divergences;
}

function score(result) {
  const value = result?.metric ?? result?.score;
  return Number.isFinite(value) ? value : null;
}

function buildDiff(baseline, intervention) {
  const baselineSteps = baseline.result?.trajectory || baseline.result?.turns || [];
  const interventionSteps = intervention.result?.trajectory || intervention.result?.turns || [];
  const divergences = compareTrajectories(baselineSteps, interventionSteps);
  const baselineScore = score(baseline.result);
  const interventionScore = score(intervention.result);
  return {
    schema: 'genos.procedural-causal-diff/v1', experimentId: baseline.experiment_id,
    baselineForkId: baseline.fork_id, interventionForkId: intervention.fork_id,
    snapshotId: baseline.snapshot_id, snapshotHash: baseline.snapshot_hash,
    seed: baseline.seed, divergenceCount: divergences.length,
    firstDivergenceStep: divergences[0]?.stepIndex ?? null, divergences,
    baselineScore, interventionScore,
    scoreDelta: baselineScore === null || interventionScore === null ? null : interventionScore - baselineScore,
    attributionScope: 'observed-divergent-steps-under-declared-runner-snapshot-environment-and-seed',
  };
}

async function loadCompletedFork(db, forkId) {
  const fork = await loadFork(db, forkId);
  if (!fork) throw new Error(`Unknown causal fork '${forkId}'.`);
  if (fork.status !== 'completed') throw new Error('CAUSAL_FORK_NOT_COMPLETED');
  const resultEvent = [...fork.events].reverse().find((event) => event.event_type === 'RUN_RESULT');
  if (!resultEvent) throw new Error('CAUSAL_REPLAY_RESULT_MISSING');
  fork.result = resultEvent.payload.result;
  if (digest(fork.result) !== resultEvent.state_hash) throw new Error('CAUSAL_REPLAY_RESULT_CORRUPT');
  return fork;
}

async function causalDiff(db, input) {
  await ensureDiffSchema(db);
  const baseline = await loadCompletedFork(db, input.baselineForkId);
  const intervention = await loadCompletedFork(db, input.interventionForkId);
  if (baseline.experiment_id !== intervention.experiment_id
    || baseline.snapshot_id !== intervention.snapshot_id || baseline.seed !== intervention.seed
    || baseline.arm !== 'control' || intervention.arm !== 'intervention') {
    throw new Error('CAUSAL_FORK_PAIR_MISMATCH');
  }
  const diff = buildDiff(baseline, intervention);
  const diffHash = digest(diff);
  const diffId = `causal_diff_${diffHash.slice(0, 24)}`;
  await db.run(`INSERT OR IGNORE INTO procedural_causal_diffs
    (diff_id, experiment_id, baseline_fork_id, intervention_fork_id, diff_hash, diff_json)
    VALUES (?, ?, ?, ?, ?, ?)`, [diffId, baseline.experiment_id, baseline.fork_id, intervention.fork_id, diffHash, JSON.stringify(diff)]);
  return { diffId, diffHash, ...diff };
}

async function verifyReplayInputs(db, fork, input) {
  const experiment = await db.get('SELECT * FROM procedural_causal_experiments WHERE experiment_id = ?', [fork.experiment_id]);
  if (experiment.runner_id !== input.runnerId) throw new Error('CAUSAL_RUNNER_DRIFT');
  if (experiment.environment_id !== input.environmentId) throw new Error('CAUSAL_ENV_DRIFT');
  if (experiment.environment_hash !== digest(input.environmentManifest)) throw new Error('CAUSAL_ENV_DRIFT');
  if (fork.snapshot_hash !== digest(input.snapshotState)) throw new Error('CAUSAL_SNAPSHOT_MISMATCH');
  const arms = JSON.parse(experiment.arms_json || '{}');
  const arm = fork.arm === 'control' ? arms.control : arms.intervention;
  if (!arm) throw new Error('CAUSAL_ARM_MISSING');
  if (input.arm && digest(input.arm) !== digest(arm)) throw new Error('CAUSAL_ARM_DRIFT');
  return { experiment, budget: JSON.parse(experiment.budget_json), arm };
}

async function persistRunResult(db, forkId, result) {
  const stateHash = digest(result);
  await db.run(`INSERT INTO procedural_causal_fork_events
    (fork_id, event_type, state_hash, payload_json) VALUES (?, 'RUN_RESULT', ?, ?)`,
  [forkId, stateHash, JSON.stringify({ result })]);
  return stateHash;
}

async function replayFork(db, input) {
  await ensureSchema(db);
  if (typeof input.runner !== 'function') throw new Error('A registered runner function is required for replay.');
  const fork = await loadFork(db, input.forkId);
  if (!fork) throw new Error(`Unknown causal fork '${input.forkId}'.`);
  const { experiment, budget, arm } = await verifyReplayInputs(db, fork, input);
  if (!['pending', 'paused', 'failed', 'running'].includes(fork.status)) throw new Error('CAUSAL_FORK_NOT_RESUMABLE');
  const startHash = digest(fork.state);
  const claimed = await db.run(`UPDATE procedural_causal_forks SET status = 'running', updated_at = datetime('now')
    WHERE fork_id = ? AND checkpoint_version = ?
      AND (status IN ('pending', 'paused', 'failed') OR (status = 'running' AND updated_at < datetime('now', '-60 seconds')))`,
  [fork.fork_id, fork.checkpoint_version]);
  if (claimed.changes !== 1) throw new Error('CAUSAL_FORK_LEASE_CONFLICT');
  let checkpointVersion = fork.checkpoint_version;
  try {
    const result = await input.runner(arm, structuredClone(fork.state), {
      seed: fork.seed, budget: budget.maxSteps, environmentHash: experiment.environment_hash,
      resume: fork.checkpoint_version > 0,
      signal: input.signal,
      checkpoint: async (state) => {
        const saved = await checkpointFork(db, { forkId: fork.fork_id, expectedVersion: checkpointVersion, state, status: 'running' });
        checkpointVersion = saved.checkpointVersion;
        return saved;
      },
    });
    if (input.signal?.aborted) throw Object.assign(new Error('CAUSAL_EXPERIMENT_ABORTED'), { code: 'CAUSAL_EXPERIMENT_ABORTED' });
    const resultHash = await persistRunResult(db, fork.fork_id, result);
    await db.run("UPDATE procedural_causal_forks SET status = 'completed', updated_at = datetime('now') WHERE fork_id = ?", [fork.fork_id]);
    return { forkId: fork.fork_id, startHash, resultHash, result };
  } catch (error) {
    const status = input.signal?.aborted ? 'paused' : 'failed';
    const errorJson = status === 'paused' ? null : JSON.stringify({ message: error.message });
    await db.run('UPDATE procedural_causal_forks SET status = ?, error_json = ?, updated_at = datetime(\'now\') WHERE fork_id = ?', [status, errorJson, fork.fork_id]);
    throw error;
  }
}

module.exports = { causalDiff, replayFork, compareTrajectories };
