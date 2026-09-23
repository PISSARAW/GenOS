'use strict';

/**
 * AgentExpressionContext Service — unified operational identity for every agent.
 *
 * Aggregates ALL agent state (self, genotype, phenotype, capabilities,
 * authority, relations, communication, memory, budget) into a single
 * decision-ready object consumed by MorphogenesisPlanner, CapabilityResolver,
 * TopologyResolver, and every other decision service.
 *
 * Three public entry points:
 *   buildExpressionContext({ agentId, db, parentOrchestrator, mission, assignment })
 *   updateExpressionContext({ agentId, updates, db })
 *   getExpressionContext(agentId)
 */

const {
  loadAgentRow, buildCognitiveSelf, loadGenotype, deriveEpigeneticState,
  derivePlasmids, computePhenotype, buildManifest, loadAuthority,
  loadRelations, buildCommunicationManifest, loadCommonGround, loadTopology,
  loadMemory, loadAncestralContext, computeUncertaintyAndPressure, loadBudget,
  identityFromRow, instinctFromRegulation, generateAgentIdentity,
  loadCognitiveRegulationState, createCognitiveRegulationState,
  evaluateAgentHomeostasis, phenotypeFromRecipe, safeArray, firstDef, clamp01
} = require('./agentExpressionContextSteps');

// ---------------------------------------------------------------------------
// Internal cache
// ---------------------------------------------------------------------------

const contextCache = new Map();

// ---------------------------------------------------------------------------
// Main: buildExpressionContext
// ---------------------------------------------------------------------------

async function buildExpressionContext(opts) {
  const { agentId, db, parentOrchestrator, mission, assignment } = opts || {};

  if (!agentId) throw new Error('buildExpressionContext requires agentId');

  const role = assignment?.role || 'worker';
  const scope = {
    organizationId: parentOrchestrator?.organization_id || assignment?.workspace?.organizationId,
    projectId: parentOrchestrator?.project_id || assignment?.workspace?.projectId
  };

  // Step 1: Load agent row
  const agentRow = await loadAgentRow(db, agentId);

  // Step 2: Build CognitiveSelf
  const cognitiveSelf = await buildCognitiveSelf({ db, agentId, role, mission, assignment });

  // Step 3: Load genotype
  const genotype = await loadGenotype({ db, parentOrchestrator, assignment, scope });

  // Step 4: Epigenetic state
  const epigeneticState = deriveEpigeneticState(genotype);

  // Step 5: Plasmids
  const plasmids = derivePlasmids(genotype);

  // Step 6: Phenotype
  const phenotype = computePhenotype({ genotype, epigeneticState, assignment });

  // Step 7: Capability manifest
  const capabilityManifest = buildManifest({ phenotype, mission, assignment, budget: assignment?.budget });

  // Step 8: Authority
  const authority = loadAuthority({ phenotype, assignment, parentOrchestrator });

  // Step 9: Relations
  const relations = loadRelations({ agentId, assignment });

  // Step 10: Communication manifest
  const communicationManifest = buildCommunicationManifest({ phenotype, assignment });

  // Step 11: Common ground
  const commonGround = loadCommonGround({ cognitiveSelf, assignment });

  // Step 12: Topology membership
  const topologyMembership = loadTopology({ agentId, assignment });

  // Step 13: Memory
  const memory = loadMemory({ cognitiveSelf });
  const proceduralMemory = memory.procedural;

  // Step 14: Ancestral context
  const ancestralContext = await loadAncestralContext({ db, agentId });

  // Cognitive regulation (needed for budget + uncertainty)
  let cognitiveRegulation = null;
  try {
    cognitiveRegulation = await loadCognitiveRegulationState(db, agentId);
  } catch (_) {
    cognitiveRegulation = createCognitiveRegulationState({});
  }

  // Step 15: Uncertainty and pressure
  const { uncertainty, currentPressure } = await computeUncertaintyAndPressure({ db, agentId, cognitiveSelf });

  // Step 16: Budget
  const budget = loadBudget({ assignment, cognitiveRegulation, parentOrchestrator });

  // Identity (from agentRow or generated)
  const identity = agentRow
    ? identityFromRow(agentRow, agentId, role)
    : generateAgentIdentity({ role, stableKey: agentId });

  // Instinct state (from cognitive regulation)
  const instinctState = instinctFromRegulation(cognitiveRegulation);

  // Creative state
  const creativeState = assignment?.cognitiveRecipe
    ? phenotypeFromRecipe(assignment.cognitiveRecipe)
    : null;

  // Homeostasis
  let homeostasis = null;
  try {
    const homeoResult = await evaluateAgentHomeostasis(db, agentId, {
      energy: currentPressure.energy,
      memoryPressure: currentPressure.memoryPressure,
      stress: currentPressure.stress,
      integrity: cognitiveSelf?.regulatory?.integrity
    });
    homeostasis = { status: homeoResult.status, violations: homeoResult.violations };
  } catch (_) {
    homeostasis = { status: currentPressure.status, violations: [] };
  }

  // Assemble the full context
  const context = {
    identity,
    self: cognitiveSelf,
    cognitiveRegulation,
    homeostasis,
    instinctState,
    creativeState,
    genotype,
    epigeneticState,
    plasmids,
    phenotype,
    capabilities: phenotype.capabilities,
    capabilityManifest,
    authority,
    relations,
    communicationManifest,
    commonGround,
    topologyMembership,
    memory,
    proceduralMemory,
    ancestralContext,
    uncertainty,
    currentPressure,
    budget,
    agentId,
    builtAt: new Date().toISOString()
  };

  // Cache it
  contextCache.set(agentId, context);

  return context;
}

// ---------------------------------------------------------------------------
// updateExpressionContext — incremental update after evidence/events
// ---------------------------------------------------------------------------

async function updateExpressionContext(opts) {
  const { agentId, updates, db } = opts || {};
  if (!agentId) throw new Error('updateExpressionContext requires agentId');

  const existing = contextCache.get(agentId);
  if (!existing) {
    return buildExpressionContext({ agentId, db, ...updates });
  }

  const merged = { ...existing, ...updates, agentId, updatedAt: new Date().toISOString() };

  if (updates.budget) {
    merged.budget = { ...existing.budget, ...updates.budget };
    merged.budget.remaining = Math.max(0, merged.budget.cognitive - (merged.budget.consumed || 0));
  }

  if (updates.cognitiveRegulation) {
    const cr = updates.cognitiveRegulation;
    merged.cognitiveRegulation = { ...existing.cognitiveRegulation, ...cr };
    merged.instinctState = instinctFromRegulation(merged.cognitiveRegulation);
  }

  if (updates.homeostasis) {
    merged.homeostasis = { ...existing.homeostasis, ...updates.homeostasis };
  }

  if (updates.uncertainty !== undefined) {
    merged.uncertainty = clamp01(updates.uncertainty);
  }

  if (updates.currentPressure) {
    merged.currentPressure = { ...existing.currentPressure, ...updates.currentPressure };
  }

  contextCache.set(agentId, merged);
  return merged;
}

// ---------------------------------------------------------------------------
// getExpressionContext — retrieve cached context
// ---------------------------------------------------------------------------

function getExpressionContext(agentId) {
  if (!agentId) return null;
  return contextCache.get(agentId) || null;
}

// ---------------------------------------------------------------------------
// Clear cache (for testing / lifecycle management)
// ---------------------------------------------------------------------------

function clearCache(agentId) {
  if (agentId) contextCache.delete(agentId);
  else contextCache.clear();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  buildExpressionContext,
  updateExpressionContext,
  getExpressionContext,
  clearCache
};
