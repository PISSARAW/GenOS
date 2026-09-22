'use strict';

// Lot 16 — Organisme Procédural : primitives runtime de la pipeline
// mutation -> immune -> seal -> semantics -> promotion gate -> persist.
// Delegates to proceduralRuntimeService + proceduralPersistenceService.

const runtime = require('../proceduralRuntimeService');
const persistence = require('../proceduralPersistenceService');
const identity = require('../proceduralIdentityService');
const causal = require('../proceduralCausalValidationService');

function requireDb(context) {
  if (!context.db) {
    throw new Error('procedural primitive requires a database handle (context.db)');
  }
  return context.db;
}

async function evolveOrganism(context = {}) {
  const db = requireDb(context);
  const parent = context.parent || context.organism;
  if (!parent) {
    return { success: false, error: 'parent organism is required.' };
  }
  const options = {
    variantCount: context.variantCount || context.variant_count || 5,
    policy: context.policy || {},
    fitnessMetrics: context.fitnessMetrics || null,
  };
  const result = await runtime.runEvolutionCycle(db, parent, options);
  return {
    success: true,
    promoted: result.promoted,
    promotedId: result.promotedId || null,
    saved: result.saved || null,
    attempts: result.attempts,
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
  const runner = context.runner || context.simulator || null;
  const parent = context.parent || context.baseline;
  const candidate = context.candidate || context.organism;
  const initialState = context.initialState || context.initial_state || null;
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
