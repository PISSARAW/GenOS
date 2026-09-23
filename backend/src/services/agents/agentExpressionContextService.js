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
 *
 * Spec-shaped EpistemicState / MemoryContext / RegulatorySnapshot /
 * CognitivePhenotype / StrategyTrajectory literals live in
 * agentExpressionContextContracts (keeps every function under the gate).
 */

const {
  loadAgentRow, buildCognitiveSelf, loadGenotype, deriveEpigeneticState,
  derivePlasmids, computePhenotype, buildManifest, loadAuthority,
  loadRelations, buildCommunicationManifest, loadCommonGround, loadTopology,
  loadMemory, loadAncestralContext, computeUncertaintyAndPressure, loadBudget,
  identityFromRow, instinctFromRegulation, generateAgentIdentity,
  loadCognitiveRegulationState, createCognitiveRegulationState,
  evaluateAgentHomeostasis, phenotypeFromRecipe, safeArray, firstDef, clamp01,
  loadClinicalState, buildClinicalState, loadVitalStates,
} = require('./agentExpressionContextSteps');

const contracts = require('./agentExpressionContextContracts');

// ---------------------------------------------------------------------------
// Internal cache
// ---------------------------------------------------------------------------

const contextCache = new Map();

// ---------------------------------------------------------------------------
// Section loaders (each: max 3 params, CC <= 10)
// ---------------------------------------------------------------------------

function scopeOf(input) {
  const parent = input.parentOrchestrator || {};
  const workspace = input.assignment?.workspace || {};
  return {
    organizationId: parent.organization_id || workspace.organizationId,
    projectId: parent.project_id || workspace.projectId
  };
}

async function loadCoreState(opts) {
  const { agentId, db, parentOrchestrator, mission, assignment } = opts || {};
  const role = assignment?.role || 'worker';
  const scope = scopeOf({ parentOrchestrator, assignment });
  const agentRow = await loadAgentRow(db, agentId);
  const cognitiveSelf = await buildCognitiveSelf({ db, agentId, role, mission, assignment });
  const genotype = await loadGenotype({ db, parentOrchestrator, assignment, scope });
  const epigeneticState = deriveEpigeneticState(genotype);
  const plasmids = derivePlasmids(genotype);
  const phenotype = computePhenotype({ genotype, epigeneticState, assignment });
  return { agentId, db, parentOrchestrator, mission, assignment, role, agentRow, cognitiveSelf, genotype, epigeneticState, plasmids, phenotype };
}

function loadSocialState(core) {
  const { phenotype, mission, assignment, agentId, cognitiveSelf } = core;
  return {
    capabilityManifest: buildManifest({ phenotype, mission, assignment, budget: assignment?.budget }),
    authority: loadAuthority({ phenotype, assignment, parentOrchestrator: core.parentOrchestrator }),
    relations: loadRelations({ agentId, assignment }),
    communicationManifest: buildCommunicationManifest({ phenotype, assignment }),
    commonGround: loadCommonGround({ cognitiveSelf, assignment }),
    topologyMembership: loadTopology({ agentId, assignment })
  };
}

async function loadMemoryState(core) {
  const memory = loadMemory({ cognitiveSelf: core.cognitiveSelf });
  const ancestralContext = await loadAncestralContext({ db: core.db, agentId: core.agentId });
  return { memory, proceduralMemory: memory.procedural, ancestralContext };
}

async function loadPressureState(core) {
  let cognitiveRegulation = null;
  try {
    cognitiveRegulation = await loadCognitiveRegulationState(core.db, core.agentId);
  } catch (_) {
    cognitiveRegulation = createCognitiveRegulationState({});
  }
  const computed = await computeUncertaintyAndPressure({ db: core.db, agentId: core.agentId, cognitiveSelf: core.cognitiveSelf });
  const budget = loadBudget({ assignment: core.assignment, cognitiveRegulation, parentOrchestrator: core.parentOrchestrator });
  return { cognitiveRegulation, uncertainty: computed.uncertainty, currentPressure: computed.currentPressure, budget };
}

function homeostasisInputOf(all) {
  return {
    energy: all.currentPressure.energy,
    memoryPressure: all.currentPressure.memoryPressure,
    stress: all.currentPressure.stress,
    integrity: all.cognitiveSelf?.regulatory?.integrity
  };
}

function clinicalInputOf(all) {
  return {
    cognitiveIntegrity: all.cognitiveSelf?.regulatory?.integrity,
    stress: all.currentPressure.stress,
    energy: all.currentPressure.energy,
    budgetRatio: all.budget.remaining / Math.max(1, all.budget.cognitive || 1),
    dissonance: all.cognitiveRegulation?.dissonanceLevel,
    apoptosisRisk: all.cognitiveRegulation?.isApoptotic ? 0.5 : 0
  };
}

async function loadIdentityState(all) {
  const identity = all.agentRow
    ? identityFromRow(all.agentRow, all.agentId, all.role)
    : generateAgentIdentity({ role: all.role, stableKey: all.agentId });
  const instinctState = instinctFromRegulation(all.cognitiveRegulation);
  const creativeState = all.assignment?.cognitiveRecipe
    ? phenotypeFromRecipe(all.assignment.cognitiveRecipe)
    : null;
  let homeostasis = null;
  try {
    const homeoResult = await evaluateAgentHomeostasis(all.db, all.agentId, homeostasisInputOf(all));
    homeostasis = { status: homeoResult.status, violations: homeoResult.violations };
  } catch (_) {
    homeostasis = { status: all.currentPressure.status, violations: [] };
  }
  return { identity, instinctState, creativeState, homeostasis };
}

function assembleContext(parts) {
  return {
    identity: parts.identity,
    self: parts.cognitiveSelf,
    cognitiveRegulation: parts.cognitiveRegulation,
    regulatoryState: parts.regulatorySnapshot,
    homeostasis: parts.homeostasis,
    instinctState: parts.instinctState,
    creativeState: parts.creativeState,
    cognitivePhenotype: parts.cognitivePhenotype,
    genotype: parts.genotype,
    epigeneticState: parts.epigeneticState,
    plasmids: parts.plasmids,
    phenotype: parts.phenotype,
    capabilities: parts.phenotype.capabilities,
    capabilityManifest: parts.capabilityManifest,
    authority: parts.authority,
    relations: parts.relations,
    communicationManifest: parts.communicationManifest,
    commonGround: parts.commonGround,
    topologyMembership: parts.topologyMembership,
    memory: parts.memory,
    memoryContext: parts.memoryContext,
    proceduralMemory: parts.proceduralMemory,
    epistemicState: parts.epistemicState,
    strategyTrajectory: parts.strategyTrajectory,
    ancestralContext: parts.ancestralContext,
    uncertainty: parts.uncertainty,
    currentPressure: parts.currentPressure,
    budget: parts.budget,
    clinicalState: parts.clinicalState,
    sensorium: parts.vital.sensorium,
    metabolicState: parts.vital.metabolicState,
    resilienceEnvelope: parts.vital.resilienceEnvelope,
    developmentalState: parts.vital.developmentalState,
    proceduralSymbionts: parts.vital.proceduralSymbionts,
    agentId: parts.agentId,
    builtAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Main: buildExpressionContext
// ---------------------------------------------------------------------------

async function buildExpressionContext(opts) {
  const agentId = opts?.agentId;
  if (!agentId) throw new Error('buildExpressionContext requires agentId');

  const core = await loadCoreState(opts);
  const social = loadSocialState(core);
  const memState = await loadMemoryState(core);
  const pressure = await loadPressureState(core);
  const all = { ...core, ...social, ...memState, ...pressure };
  const identity = await loadIdentityState(all);
  const clinicalState = await loadClinicalState({ db: core.db, agentId, context: clinicalInputOf(all) });
  const epistemicState = contracts.realEpistemicOf(agentId, contracts.epistemicStubOf(agentId, core.cognitiveSelf));
  const memoryContext = contracts.memoryStubOf(agentId, { memory: memState.memory, budget: pressure.budget });
  const regulatorySnapshot = contracts.realRegulatoryOf(agentId, contracts.regulatoryStubOf(agentId, all));
  const cognitivePhenotype = contracts.phenotypeStubOf(agentId, identity.creativeState);
  const strategyTrajectory = contracts.trajectoryStubOf(agentId);
  const vital = loadVitalStates(agentId);
  const context = assembleContext({ ...all, ...identity, clinicalState, epistemicState, memoryContext, regulatorySnapshot, cognitivePhenotype, strategyTrajectory, vital });

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
