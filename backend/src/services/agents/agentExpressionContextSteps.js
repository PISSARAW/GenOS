'use strict';

/**
 * AgentExpressionContext Steps — helper functions for building the context.
 *
 * Each function implements one step of the 16-step assembly pipeline.
 * Extracted from agentExpressionContextService.js to stay under 400 lines.
 */

const { generateAgentIdentity } = require('../agentIdentityService');
const { buildAgentSelf } = require('../agentSelfService');
const { buildWorkerSelf } = require('../workerSelfService');
const {
  loadCognitiveRegulationState,
  createCognitiveRegulationState
} = require('../agentConscienceService');
const { evaluateAgentHomeostasis } = require('../organismHomeostasisService');
const { senseAgentRuntime } = require('../machineInteroceptionService');
const { buildFamilyStory } = require('../familyHistoryService');
const { workerGenesForAssignment } = require('../agentDnaStore');
const { evolveWorkerGenome } = require('../agentEvolutionService');
const { buildCapabilityManifest } = require('../capabilityResolverService');
const { getRelations, getState: getCollectiveState } = require('../collectiveStateService');
const { getPhenotype, getAuthorityProfile } = require('./phenotypeRegistryService');
const { phenotypeFromRecipe } = require('../cognitivePhenotypeService');
const { getClinicalState, refreshClinicalState, getClinicalSummary } = require('../clinicalStateService');

function safeArray(v) { return Array.isArray(v) ? v : []; }
function firstDef(...vals) {
  for (const v of vals) { if (v !== null && v !== undefined) return v; }
  return vals[vals.length - 1];
}
function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// Step 1
async function loadAgentRow(db, agentId) {
  if (!db || !agentId) return null;
  try { return await db.get('SELECT * FROM agents WHERE id = ?', agentId); }
  catch (_) { return null; }
}

// Step 2
async function buildCognitiveSelf({ db, agentId, role, mission, assignment }) {
  const context = {
    mission: mission?.prompt || assignment?.mission || '',
    hypothesis: mission?.hypothesis || null,
    capabilities: safeArray(assignment?.capabilities)
  };
  try {
    const agentSelf = await buildAgentSelf(db, agentId, { context, workerRole: role });
    return {
      identity: agentSelf.identity,
      autobiographical: agentSelf.autobiographical,
      operational: agentSelf.operational,
      regulatory: agentSelf.regulatory,
      version: agentSelf.version
    };
  } catch (_) {
    try {
      const ws = await buildWorkerSelf(db, { agentId, workerRole: role, workerContext: context });
      return {
        identity: ws.identity,
        autobiographical: { episodes: ws.lessons, lessons: [], turningPoints: [], episodeCount: 0, lessonCount: 0 },
        operational: ws.operational,
        regulatory: ws.regulatory,
        version: 'worker-self-fallback'
      };
    } catch (_) { return null; }
  }
}

// Step 3
async function loadGenotype({ db, parentOrchestrator, assignment, scope }) {
  const role = assignment?.role || 'worker';
  const dnaAssignment = {
    role, capabilities: safeArray(assignment?.capabilities),
    mission: assignment?.mission || '', genomeRef: assignment?.genomeRef,
    preferredName: assignment?.preferredName, tools: safeArray(assignment?.tools)
  };
  try {
    const sel = await workerGenesForAssignment(db, { ...dnaAssignment, agentId: parentOrchestrator?.id }, scope);
    if (sel) return { genes: sel.genes, genomeRef: sel.genomeRef, genomeContentHash: sel.genomeContentHash, source: 'agent_dna' };
  } catch (_) {}
  try {
    const evo = await evolveWorkerGenome(parentOrchestrator || {}, { role }, { strategy: assignment?.strategy || 'tree-search', db });
    if (evo) return { genes: evo.genes, genomeRef: evo.genomeRef, genomeContentHash: null, source: 'evolution_fallback' };
  } catch (_) {}
  return null;
}

// Step 4
function deriveEpigeneticState(genotype) {
  if (!genotype?.genes) return null;
  const g = genotype.genes;
  return {
    activeTraits: safeArray(g.capabilities), expressedRole: g.role || null,
    expressedStrategy: g.strategy || null, silencingMarkers: g.silencingMarkers || [],
    neotenicMode: g.neotenic_mode || 'plastique'
  };
}

// Step 5
function derivePlasmids(genotype) {
  if (!genotype?.genes) return [];
  const plasmids = safeArray(genotype.genes.plasmids);
  if (plasmids.length > 0) return plasmids;
  return safeArray(genotype.genes.extraChromosomes).map((c, i) => ({
    id: `plasmid_${i}`, source: 'extra_chromosome', traits: safeArray(c.traits)
  }));
}

// Step 6
function computePhenotype({ genotype, epigeneticState, assignment }) {
  const genes = genotype?.genes || {};
  const role = genes.role || assignment?.role || 'worker';
  const registryPhenotype = getPhenotype(role);
  return {
    role, strategy: genes.strategy || 'tree-search',
    capabilities: safeArray(genes.capabilities), tools: safeArray(genes.tools),
    cognitiveRecipe: assignment?.cognitiveRecipe || null, artifact: assignment?.artifact || null,
    neotenicMode: epigeneticState?.neotenicMode || 'plastique',
    registryMatch: registryPhenotype ? registryPhenotype.id : null,
    expressedAt: new Date().toISOString()
  };
}

// Step 7
function buildManifest({ phenotype, mission, assignment, budget }) {
  try {
    return buildCapabilityManifest({
      prompt: mission?.prompt || assignment?.mission || '',
      role: phenotype.role, mode: assignment?.mode || 'worker',
      topology: assignment?.topology || null, budget: budget || {},
      domain: assignment?.domain || ''
    });
  } catch (_) {
    return { owned: [], inherited: [], currently_expressed: [], suppressed: [], unavailable: [], entries: [] };
  }
}

// Step 8
function loadAuthority({ phenotype, assignment, parentOrchestrator }) {
  const registryAuth = getAuthorityProfile(phenotype.role);
  const ap = assignment?.authorityProfile || {};
  return {
    constraints: ap.constraints || {}, maxBlastRadius: firstDef(ap.maxBlastRadius, 0.4),
    allowFileEdits: firstDef(ap.allowFileEdits, false), allowNetworkAccess: firstDef(ap.allowNetworkAccess, false),
    maxTokenBudget: firstDef(ap.maxTokenBudget, assignment?.budget?.tokens || 0),
    registryAuthority: registryAuth, parentAuthority: parentOrchestrator?.authorityProfile || null
  };
}

// Step 9
function loadRelations({ agentId, assignment }) {
  const fromAssignment = safeArray(assignment?.relations);
  try { return { assignment: fromAssignment, collective: getRelations(agentId) }; }
  catch (_) { return { assignment: fromAssignment, collective: [] }; }
}

// Step 10
function buildCommunicationManifest({ phenotype, assignment }) {
  const commProfile = getPhenotype(phenotype.role)?.communicationProfile || {};
  return {
    signal: firstDef(commProfile.signal, true), publish: firstDef(commProfile.publish, false),
    inbox: firstDef(commProfile.inbox, false), broadcast: firstDef(commProfile.broadcast, false),
    channels: safeArray(assignment?.communicationChannels), parentChannel: assignment?.parentChannel || null
  };
}

// Step 11
function loadCommonGround({ cognitiveSelf, assignment }) {
  const auto = cognitiveSelf?.autobiographical || {};
  return {
    sharedContext: assignment?.sharedContext || null,
    mutualUnderstandings: safeArray(assignment?.mutualUnderstandings),
    collectiveMemory: safeArray(assignment?.collectiveMemory),
    lessons: safeArray(auto.lessons), turningPoints: safeArray(auto.turningPoints)
  };
}

// Step 12
function loadTopology({ agentId, assignment }) {
  const fromAssignment = assignment?.topologyMembership || null;
  try {
    const state = getCollectiveState();
    return { assignment: fromAssignment, collective: state.agents.get(agentId) || null };
  } catch (_) { return { assignment: fromAssignment, collective: null }; }
}

// Step 13
function loadMemory({ cognitiveSelf }) {
  const auto = cognitiveSelf?.autobiographical || {};
  return {
    episodic: safeArray(auto.episodes), semantic: safeArray(auto.lessons),
    procedural: safeArray(auto.lessons).map(l => ({ id: l.id, claim: l.claim, confidence: l.confidence, recommendation: l.recommendation })),
    autobiographical: { episodeCount: auto.episodeCount || 0, lessonCount: auto.lessonCount || 0 }
  };
}

// Step 14
async function loadAncestralContext({ db, agentId }) {
  try {
    const story = await buildFamilyStory(db, agentId, { maxDepth: 3 });
    return {
      ancestryDepth: story.ancestryDepth, descendantCount: story.descendantCount,
      narrative: story.narrative, continuity: story.continuity,
      hasMutationEvents: story.continuity?.hasMutationEvents || false
    };
  } catch (_) {
    return { ancestryDepth: 0, descendantCount: 0, narrative: null, continuity: null, hasMutationEvents: false };
  }
}

// Step 15
async function computeUncertaintyAndPressure({ db, agentId, cognitiveSelf }) {
  const regulatory = cognitiveSelf?.regulatory || {};
  const uncertainty = clamp01(regulatory.uncertainty);
  let pressure = {
    energy: clamp01(regulatory.energy), stress: clamp01(regulatory.stress),
    contextPressure: 0, memoryPressure: 0, status: 'nominal'
  };
  try {
    const sensing = await senseAgentRuntime(db, agentId);
    pressure = {
      energy: clamp01(sensing.variables.energy), stress: clamp01(sensing.variables.stress),
      contextPressure: clamp01(sensing.variables.context_pressure),
      memoryPressure: clamp01(sensing.variables.memory_pressure), status: 'sensed'
    };
  } catch (_) {}
  return { uncertainty, currentPressure: pressure };
}

// Step 16
function loadBudget({ assignment, cognitiveRegulation, parentOrchestrator }) {
  const ab = assignment?.budget || {};
  return {
    tokens: firstDef(ab.tokens, 0), cognitive: cognitiveRegulation?.currentBudget || 0,
    baseline: cognitiveRegulation?.baselineBudget || 0, consumed: firstDef(ab.consumed, 0),
    remaining: Math.max(0, (cognitiveRegulation?.currentBudget || 0) - firstDef(ab.consumed, 0)),
    parentCognitiveBudget: parentOrchestrator?.cognitive_budget || 0
  };
}

// Identity from row
function identityFromRow(agentRow, agentId, role) {
  return {
    id: agentRow.id, name: agentRow.name || agentId, nameMeaning: agentRow.name_meaning || null,
    role: agentRow.role || role, generation: agentRow.generation || 0,
    parents: agentRow.parent_id ? [agentRow.parent_id] : [],
    lineageId: agentRow.lineage_id || null, birth: agentRow.created_at || null
  };
}

// Instinct state from cognitive regulation
function instinctFromRegulation(cr) {
  return {
    dissonanceLevel: cr?.dissonanceLevel || 0, eurekaMoments: cr?.eurekaMoments || 0,
    isApoptotic: cr?.isApoptotic || false,
    harmony: cr?.maxDissonanceThreshold
      ? Math.round(((cr.maxDissonanceThreshold - (cr.dissonanceLevel || 0)) / cr.maxDissonanceThreshold) * 100)
      : 100
  };
}

// Step 17: Load or refresh clinical state from medical runtime
async function loadClinicalState({ db, agentId, context = {} }) {
  if (!db || !agentId) return null;
  try {
    const state = await getClinicalState(db, agentId);
    if (!state) return null;
    const refreshed = await refreshClinicalState(db, agentId, {
      cognitiveIntegrity: context.cognitiveIntegrity,
      stress: context.stress,
      energy: context.energy,
      budgetRatio: context.budgetRatio,
      dissonance: context.dissonance,
      apoptosisRisk: context.apoptosisRisk,
    });
    return buildClinicalState(refreshed);
  } catch (_) {
    return null;
  }
}

// Build a decision-ready clinical summary
function buildClinicalState(state) {
  if (!state) return null;
  const summary = getClinicalSummary(state);
  return {
    wellnessScore: summary.wellnessScore,
    status: summary.status,
    cellCycleState: summary.cellCycleState,
    immuneTiter: summary.immuneTiter,
    inflammatoryIndex: summary.inflammatoryIndex,
    plasmidLoad: summary.plasmidLoad,
    iatrogenicLoad: summary.iatrogenicLoad,
    pathogenBurden: summary.pathogenBurden,
    requiresTherapy: summary.wellnessScore < 0.5 || summary.iatrogenicLoad > 0.6,
    quarantineRequired: summary.pathogenBurden > 0.8 || (summary.status === 'critical' && summary.cellCycleState === 'M'),
  };
}

module.exports = {
  loadAgentRow, buildCognitiveSelf, loadGenotype, deriveEpigeneticState,
  derivePlasmids, computePhenotype, buildManifest, loadAuthority,
  loadRelations, buildCommunicationManifest, loadCommonGround, loadTopology,
  loadMemory, loadAncestralContext, computeUncertaintyAndPressure, loadBudget,
  identityFromRow, instinctFromRegulation, generateAgentIdentity,
  loadCognitiveRegulationState, createCognitiveRegulationState,
  evaluateAgentHomeostasis, phenotypeFromRecipe, safeArray, firstDef, clamp01,
  loadClinicalState, buildClinicalState, loadVitalStates,
};

// Vital states 6-10 : sens, métabolisme, survie, développement, organes.
// Chargement tolérant : un organe manquant donne null, jamais d'exception.
function loadVitalStates(agentId) {
  return safeVital(agentId);
}

function safeVital(agentId) {
  try {
    const sensorium = safeRequire('../perception/sensoriumService').getSensorium(agentId);
    const metabolic = safeRequire('../metabolism/metabolicStateService').getMetabolic(`worker:${agentId}`);
    const resilience = safeRequire('../resilience/resilienceStateService').getResilience(agentId);
    const developmental = safeRequire('../development/developmentalStateService').getDevelopmental(agentId);
    const symbionts = safeRequire('../proceduralSymbiont/symbiontService').forHost(agentId);
    const envelope = safeRequire('../resilience/resilienceEnvelopeService').getEnvelope(agentId);
    return { sensorium, metabolicState: metabolic, resilience, developmentalState: developmental, proceduralSymbionts: symbionts, resilienceEnvelope: envelope };
  } catch (_) {
    return { sensorium: null, metabolicState: null, resilience: null, developmentalState: null, proceduralSymbionts: [], resilienceEnvelope: null };
  }
}

function safeRequire(path) {
  try {
    return require(path);
  } catch (_) {
    return null;
  }
}
