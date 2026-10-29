'use strict';

const nursery = require('./gvxExperimentalNursery');
const experiments = require('./proceduralCausalExperimentService');
const replay = require('./proceduralCausalReplayService');
const protocol = require('./pairedReplayProtocol');
const registry = require('./proceduralRegistryService');
const verifiers = require('./gvxVerifierRegistry');
const { error, sameScope } = require('./gvxContracts');

function side(arm) {
  const value = { baseline: 'control', candidate: 'intervention' }[arm.role];
  if (!value) throw error('GVX_PAIRED_ARM_INVALID');
  return value;
}

async function current(options) {
  const row = await experiments.loadExperiment(options.db, options.causalExperimentId);
  if (!row || !protocol.enabled(row)) throw error('GVX_PAIRED_PROTOCOL_REQUIRED');
  protocol.verify(row, { scope: options.scope });
  protocol.verifyRunner(row, { runner: registry.resolveRunner(row.runner_id) });
  const input = options.input;
  if (!sameScope(options.scope, { ...input.scope, entityId: input.entityId })
      || input.snapshotHash !== JSON.parse(row.snapshot_hashes_json)[options.snapshotId]
      || !JSON.parse(row.seeds_json).includes(options.seed)) throw error('GVX_PAIRED_BINDING_MISMATCH');
  validateControls(input.controls, row);
  return row;
}

function validateControls(controls, row) {
  if (controls.model !== `procedural:${row.runner_id}` || controls.toolsetHash !== row.runner_hash
      || controls.environmentHash !== row.environment_hash) throw error('GVX_PAIRED_CONTROLS_MISMATCH');
}

async function existingFork(options, arm) {
  return options.db.get(`SELECT fork_id FROM procedural_causal_forks
    WHERE experiment_id=? AND snapshot_id=? AND seed=? AND arm=?`,
  [options.causalExperimentId, options.snapshotId, options.seed, side(arm)]);
}

async function forkFor(options, arm) {
  const existing = await existingFork(options, arm);
  if (existing) return existing.fork_id;
  const fork = await experiments.createFork(options.db, { experimentId: options.causalExperimentId,
    snapshotId: options.snapshotId, seed: options.seed, arm: side(arm), scope: options.scope });
  return fork.forkId;
}

async function forkEvidence(options, arm) {
  const row = await current(options);
  const selected = await existingFork(options, arm);
  if (!selected) throw error('GVX_PAIRED_FORK_MISSING');
  const fork = await experiments.loadFork(options.db, selected.fork_id);
  require('./pairedReplayRuntime').binding(row, fork, { scope: options.scope });
  const result = fork.events.filter(event => event.event_type === 'RUN_RESULT').at(-1);
  if (fork.status !== 'completed' || !result || experiments.digest(result.payload.result) !== result.state_hash) {
    throw error('GVX_PAIRED_RESULT_REQUIRED');
  }
  require('./pairedReplayRandomness').verify(result.payload.replayObservation,
    require('./pairedReplayRuntime').binding(row, fork, { scope: options.scope }));
  return Buffer.from(JSON.stringify({ schema: 'genos.gvx.paired-replay-arm/v1',
    experimentId: row.experiment_id, protocolHash: row.replay_protocol_hash,
    snapshotId: options.snapshotId, seed: options.seed, role: arm.role, forkId: fork.fork_id,
    resultHash: result.state_hash, eventHash: result.event_hash,
    observation: result.payload.replayObservation, causalGuarantee: false, runtimeAuthority: false }));
}

async function validateCached(options, context) {
  const bytes = await forkEvidence(options, context.arm);
  const evidence = context.outcome.evidence;
  if (evidence?.length !== 1 || evidence[0].artifactHash !== verifiers.digest(bytes)) {
    throw error('GVX_PAIRED_CACHED_EVIDENCE_CHANGED');
  }
  const saved = await options.artifactReader({ artifactRef: evidence[0].artifactRef });
  if (!Buffer.isBuffer(saved) || !saved.equals(bytes)) throw error('GVX_PAIRED_ARTIFACT_CHANGED');
}

async function runWorld(options, { arm }) {
  const row = await current(options);
  const forkId = await forkFor(options, arm);
  const fork = await experiments.loadFork(options.db, forkId);
  if (fork.status !== 'completed') {
    await replay.replayFork(options.db, { forkId, scope: options.scope,
      runnerId: row.runner_id, environmentId: row.environment_id,
      environmentManifest: JSON.parse(row.environment_manifest_json),
      snapshotState: JSON.parse(row.snapshot_states_json)[options.snapshotId],
      runner: registry.resolveRunner(row.runner_id), signal: options.signal });
  }
  const bytes = await forkEvidence(options, arm);
  const stored = await options.artifactWriter({ bytes, schema: 'genos.gvx.paired-replay-arm/v1' });
  const saved = await options.artifactReader({ artifactRef: stored?.artifactRef });
  if (!Buffer.isBuffer(saved) || !saved.equals(bytes)) throw error('GVX_PAIRED_ARTIFACT_PERSISTENCE_INVALID');
  return { status: 'completed', cost: null, metrics: {}, evidence: [{ requirement: 'artifact-integrity',
    verifierId: 'artifact-integrity-v1', artifactRef: stored.artifactRef, artifactHash: verifiers.digest(bytes) }] };
}

async function run(options) {
  if (!options?.input || typeof options.artifactWriter !== 'function'
      || typeof options.artifactReader !== 'function' || options.requireAttestation) {
    throw error('GVX_PAIRED_ADAPTERS_INVALID');
  }
  await current(options);
  if (options.input.experimentDesign.type !== 'paired'
      || JSON.stringify(options.input.verifierRequirements) !== '["artifact-integrity"]') {
    throw error('GVX_PAIRED_DESIGN_INVALID');
  }
  const nurseryOptions = { ...options };
  // This protocol seed belongs to the causal replay adapter, not a GVX runtime profile.
  delete nurseryOptions.seed;
  const result = await nursery.run({ ...nurseryOptions, metricAllowlist: [],
    verifierRegistry: verifiers.fromTrustedRegistry(['artifact-integrity-v1']),
    createIsolatedWorld: async ({ arm }) => {
      await current(options);
      return { worldId: arm.worldId, isolationId: arm.isolationId };
    }, runWorld: context => runWorld(options, context),
    validateCachedOutcome: context => validateCached(options, context) });
  await current(options);
  const arms = options.input.experimentDesign.arms;
  const left = await existingFork(options, arms.find(arm => side(arm) === 'control'));
  const right = await existingFork(options, arms.find(arm => side(arm) === 'intervention'));
  const diff = await replay.causalDiff(options.db, { baselineForkId: left.fork_id,
    interventionForkId: right.fork_id, scope: options.scope });
  return { ...result, diff, isolation: 'logical-state-only', semanticOracle: 'not_evaluated',
    causalGuarantee: false, runtimeAuthority: false, promotionAllowed: false };
}

module.exports = { run };
