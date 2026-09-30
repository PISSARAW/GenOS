'use strict';

// Lot 16 — Organisme Procédural : primitives runtime de la pipeline
// mutation -> immune -> seal -> semantics -> promotion gate -> persist.
// Delegates to proceduralRuntimeService + proceduralPersistenceService.
// Transportable design: callers send runnerId / evaluatorId / environmentId /
// snapshotId (JSON-safe); functions are resolved via proceduralRegistryService.

const runtime = require('../proceduralRuntimeService');
const persistence = require('../proceduralPersistenceService');
const identity = require('../proceduralIdentityService');
const causal = require('../proceduralCausalValidationService');
const registry = require('../proceduralRegistryService');
const replicatedCausal = require('../replicatedCausalValidationService');

function requireDb(context) {
  if (!context.db) {
    throw new Error('procedural primitive requires a database handle (context.db)');
  }
  return context.db;
}

function resolveEvaluatorRef(context) {
  if (typeof context.fitnessMetrics === 'function') return context.fitnessMetrics;
  if (context.evaluatorId) return registry.resolveEvaluator(context.evaluatorId);
  return null;
}

function resolveRunnerRef(context) {
  if (typeof context.runner === 'function') return context.runner;
  if (typeof context.simulator === 'function') return context.simulator;
  if (typeof context.causalRunner === 'function') return context.causalRunner;
  if (context.runnerId) return registry.resolveRunner(context.runnerId);
  return null;
}

function resolveStateRef(context) {
  if (context.initialState != null) return context.initialState;
  if (context.initial_state != null) return context.initial_state;
  if (context.snapshotId) return registry.resolveSnapshot(context.snapshotId);
  if (context.environmentId) {
    try {
      return registry.resolveEnvironment(context.environmentId);
    } catch (e) {
      void e;
      return null;
    }
  }
  return null;
}

function resolveCausalRef(resolver, id, label) {
  try { return resolver(id); } catch (_) {
    throw Object.assign(new Error(`Registered causal ${label} '${id}' was not found.`), { code: 'CAUSAL_PROTOCOL_INSUFFICIENT' });
  }
}

function buildEvolutionOptions(context) {
  return {
    variantCount: context.variantCount || context.variant_count || 5,
    policy: context.policy || {},
    fitnessMetrics: resolveEvaluatorRef(context),
    causalRunner: resolveRunnerRef(context),
    initialState: resolveStateRef(context),
    runnerId: context.runnerId || null,
    evaluatorId: context.evaluatorId || null,
    environmentId: context.environmentId || null,
    snapshotId: context.snapshotId || null,
    maxPerNiche: context.maxPerNiche || context.max_per_niche || 2,
  };
}

async function evolveOrganism(context = {}) {
  const db = requireDb(context);
  const parent = context.parent || context.organism;
  if (!parent) {
    return { success: false, error: 'parent organism is required.' };
  }
  const result = await runtime.runEvolutionCycle(db, parent, buildEvolutionOptions(context));
  return {
    success: true,
    promoted: result.promoted,
    promotedId: result.promotedId || null,
    saved: result.saved || null,
    attempts: result.attempts,
    viableCount: result.viableCount ?? null,
    paretoCount: result.paretoCount ?? null,
    nicheCount: result.nicheCount ?? null,
    reason: result.reason || null,
  };
}

async function loadOrganism(context = {}) {
  const db = requireDb(context);
  const versionId = context.versionId || context.version_id || context.id;
  if (!versionId) {
    return { success: false, error: 'versionId is required.' };
  }
  const organism = await persistence.loadGenome(db, versionId);
  return { success: true, found: !!organism, organism: organism || null };
}

async function phylogenyOrganism(context = {}) {
  const db = requireDb(context);
  const versionId = context.versionId || context.version_id || context.id;
  if (!versionId) {
    return { success: false, error: 'versionId is required.' };
  }
  const lineage = await persistence.getPhylogeny(db, versionId);
  return {
    success: true,
    lineage,
    versions: lineage.map((o) => o.metadata.version),
    ids: lineage.map((o) => o.metadata.id),
  };
}

async function sealOrganism(context = {}) {
  const organism = context.organism || context.parent;
  if (!organism) {
    return { success: false, error: 'organism is required.' };
  }
  const sealed = identity.sealOrganism(organism);
  const validation = identity.validateOrganism(sealed);
  return { success: validation.valid, sealed, validation };
}

async function causalCheck(context = {}) {
  const runner = resolveRunnerRef(context);
  const parent = context.parent || context.baseline;
  const candidate = context.candidate || context.organism;
  const initialState = resolveStateRef(context);
  if (!parent || !candidate) {
    return { success: false, error: 'parent and candidate organisms are required.' };
  }
  if (!runner) {
    return { success: false, error: 'runner (procedure simulator) is required for causal comparison.' };
  }
  const result = causal.validateCausally({ runner, parent, candidate, initialState });
  return { success: true, ...result };
}

async function replicatedCausalCheck(context = {}) {
  const db = requireDb(context);
  if (!context.runnerId || !context.snapshotId || !context.environmentId) {
    throw Object.assign(new Error('runnerId, snapshotId and environmentId are required.'), { code: 'CAUSAL_PROTOCOL_INSUFFICIENT' });
  }
  const environmentManifest = resolveCausalRef(registry.resolveEnvironment, context.environmentId, 'environment');
  const initialState = resolveCausalRef(registry.resolveSnapshot, context.snapshotId, 'snapshot');
  const runner = resolveCausalRef(registry.resolveRunner, context.runnerId, 'runner');
  const environmentHash = context.environmentHash || replicatedCausal.digest(environmentManifest);
  if (context.parent && context.candidate) {
    return causal.validateReplicatedCausally({
      experimentId: context.experimentId,
      snapshotId: context.snapshotId,
      initialState,
      environmentManifest,
      environmentHash,
      seeds: context.seeds,
      budget: context.budget,
      parent: context.parent,
      candidate: context.candidate,
      evidenceRefs: context.evidenceRefs || context.evidence_refs,
      runner,
      runId: context.runId,
    }, { db });
  }
  const spec = {
    experimentId: context.experimentId,
    snapshotId: context.snapshotId,
    initialState,
    environmentManifest,
    environmentHash,
    seeds: context.seeds,
    budget: context.budget,
    control: context.control,
    intervention: context.intervention,
    evidenceRefs: context.evidenceRefs || context.evidence_refs,
    runner,
    runId: context.runId,
  };
  return replicatedCausal.runReplicatedExperiment(spec, { db });
}

async function createCausalExperiment(context = {}) {
  const db = requireDb(context);
  const spec = context.spec || context;
  return { success: true, ...await require('../proceduralCausalExperimentService').createExperiment(db, spec) };
}

async function createCausalFork(context = {}) {
  const db = requireDb(context);
  return { success: true, ...await require('../proceduralCausalExperimentService').createFork(db, context) };
}

async function replayCausalFork(context = {}) {
  const db = requireDb(context);
  const runner = resolveCausalRef(registry.resolveRunner, context.runnerId, 'runner');
  const environmentManifest = resolveCausalRef(registry.resolveEnvironment, context.environmentId, 'environment');
  const snapshotState = resolveCausalRef(registry.resolveSnapshot, context.snapshotId, 'snapshot');
  return { success: true, ...await require('../proceduralCausalReplayService').replayFork(db, {
    ...context, runner, environmentManifest, snapshotState,
  }) };
}

async function diffCausalForks(context = {}) {
  const db = requireDb(context);
  return { success: true, ...await require('../proceduralCausalReplayService').causalDiff(db, context) };
}

async function analyzeCausalSnapshots(context = {}) {
  const db = requireDb(context);
  return { success: true, ...await require('../proceduralCausalAnalysisService').persistSnapshotAnalysis(db, context) };
}

async function persistCausalGraph(context = {}) {
  const db = requireDb(context);
  return { success: true, ...await require('../proceduralCausalGraphService').persistCausalGraph(db, context) };
}
module.exports = {
  HANDLERS: {
    procedural_evolve: evolveOrganism,
    organism_evolve: evolveOrganism,
    procedural_load: loadOrganism,
    organism_load: loadOrganism,
    procedural_phylogeny: phylogenyOrganism,
    organism_phylogeny: phylogenyOrganism,
    procedural_seal: sealOrganism,
    organism_seal: sealOrganism,
    procedural_causal_check: causalCheck,
    organism_causal_check: causalCheck,
    procedural_replicated_causal_check: replicatedCausalCheck,
    procedural_causal_experiment_create: createCausalExperiment,
    procedural_causal_fork_create: createCausalFork,
    procedural_causal_replay: replayCausalFork,
    procedural_causal_diff: diffCausalForks,
    procedural_causal_analyze_snapshots: analyzeCausalSnapshots,
    procedural_causal_graph: persistCausalGraph,
    organism_replicated_causal_check: replicatedCausalCheck,
  },
  evolveOrganism,
  loadOrganism,
  phylogenyOrganism,
  sealOrganism,
  causalCheck,
  replicatedCausalCheck,
  createCausalExperiment,
  createCausalFork,
  replayCausalFork,
  diffCausalForks,
  analyzeCausalSnapshots,
  persistCausalGraph,
};

