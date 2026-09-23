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
  },
  evolveOrganism,
  loadOrganism,
  phylogenyOrganism,
  sealOrganism,
  causalCheck,
};
