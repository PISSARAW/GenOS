'use strict';

/**
 * AgentExpressionContextContracts — stub builders + live adapters.
 *
 * Holds the spec-shaped EpistemicState / MemoryContext / RegulatorySnapshot /
 * CognitivePhenotype / StrategyTrajectory literals and the fail-soft adapters
 * that overlay live service state. Keeps agentExpressionContextService under
 * the complexity gate (each function: max 3 params, CC <= 10).
 */

const epistemicStateService = require('../epistemics/epistemicStateService');
const regulatoryBridge = require('../regulation/regulatoryBridgeService');

function nowIso() {
  return new Date().toISOString();
}

function idOf(entry) {
  return entry.id || String(entry);
}

function evidenceIdsOf(entry) {
  const list = entry.evidence || [];
  return list.map(idOf);
}

function claimViewOf(entry) {
  return {
    id: entry.id || 'claim',
    statement: entry.statement || '',
    confidence: entry.confidence ?? 0.5,
    source: entry.provenance?.origin || 'computed',
    evidenceIds: evidenceIdsOf(entry),
    epistemicStatus: 'provisional'
  };
}

function uncertaintyViewOf(entry) {
  return {
    id: entry.id || 'unc',
    domain: entry.topic || 'global',
    description: entry.note || entry.topic || '',
    severity: 'medium',
    unknownsCount: 1
  };
}

function asArrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function liveStateOf(agentId) {
  if (!epistemicStateService.getState) return null;
  return epistemicStateService.getState(agentId);
}

function liveClaimsOf(live) {
  if (!live || !live.claims) return null;
  return asArrayOf(live.claims).map(claimViewOf);
}

function liveUncertaintiesOf(live) {
  return asArrayOf(live.uncertainties).map(uncertaintyViewOf);
}

function realEpistemicOf(agentId, fallback) {
  try {
    const live = liveStateOf(agentId);
    const claims = liveClaimsOf(live);
    if (!claims) return fallback;
    return {
      ...fallback,
      claims,
      uncertainties: liveUncertaintiesOf(live),
      confidence: live.overallConfidence ?? fallback.confidence
    };
  } catch (_) {
    return fallback;
  }
}

function realRegulatoryOf(agentId, fallback) {
  try {
    const snap = regulatoryBridge.toSnapshot(agentId);
    if (!snap || !snap.drives) return fallback;
    return snap;
  } catch (_) {
    return fallback;
  }
}

function calibrationOf(cognitiveSelf) {
  const competence = cognitiveSelf?.competence || {};
  return {
    brierScore: competence.meanAbsoluteError || 0,
    calibrationError: competence.meanAbsoluteError || 0,
    observationsCount: competence.calibrationObservations || 0,
    lastCalibratedAt: nowIso()
  };
}

function globalUncertaintyOf(cognitiveSelf) {
  if (!cognitiveSelf?.uncertainty) return [];
  return [{
    id: 'unc-001',
    domain: 'global',
    description: cognitiveSelf.uncertainty,
    severity: 'medium',
    unknownsCount: 1
  }];
}

function epistemicStubOf(agentId, cognitiveSelf) {
  const epistemic = cognitiveSelf?.epistemic || {};
  return {
    id: `epistemic-${agentId}`,
    version: '1.0.0',
    timestamp: nowIso(),
    claims: epistemic.claims || [],
    hypotheses: epistemic.hypotheses || [],
    refutations: epistemic.refutations || [],
    uncertainties: globalUncertaintyOf(cognitiveSelf),
    contradictions: epistemic.contradictions || [],
    evidenceLinks: epistemic.evidenceLinks || [],
    confidence: cognitiveSelf?.competence?.confidence || 0.5,
    calibration: calibrationOf(cognitiveSelf),
    provenance: { source: 'computed', derivedAt: nowIso() },
    independenceGraph: { nodes: [], edges: [] },
    knownUnknowns: epistemic.knownUnknowns || [],
    unresolvedQuestions: epistemic.unresolvedQuestions || []
  };
}

function memoryStubOf(agentId, bundle) {
  const memory = bundle.memory || {};
  const budget = bundle.budget || {};
  const allowance = budget.memory || 1000;
  return {
    id: `mem-${agentId}`,
    version: '1.0.0',
    timestamp: nowIso(),
    relevantFacts: memory.facts || [],
    relevantEpisodes: memory.episodes || [],
    procedures: memory.procedural || [],
    knownDeadEnds: memory.deadEnds || [],
    unresolvedContradictions: memory.unresolvedContradictions || [],
    provenanceRefs: memory.provenanceRefs || [],
    tokenBudget: { allocated: allowance, consumed: 0, remaining: allowance, priority: 'normal' }
  };
}

function drivesStubOf(input) {
  const pressure = input.currentPressure || {};
  const selfReg = input.cognitiveSelf?.regulatory || {};
  const drives = input.cognitiveRegulation?.drives || {};
  return {
    energy: 1 - (pressure.energy || 0),
    integrity: selfReg.integrity || 1,
    curiosity: drives.curiosity || 0.5,
    survival: pressure.status === 'critical' ? 0 : 1
  };
}

function modulatorsStubOf(input) {
  const pressure = input.currentPressure || {};
  const modulators = input.cognitiveRegulation?.modulators || {};
  return {
    stress: pressure.stress || 0,
    threat: modulators.threat || 0,
    dopamine: modulators.dopamine || 0,
    adrenaline: modulators.adrenaline || 0,
    cortisol: modulators.cortisol || 0,
    oxytocin: modulators.oxytocin || 0
  };
}

function balanceStubOf(input) {
  const regulation = input.cognitiveRegulation || {};
  const selfReg = input.cognitiveSelf?.regulatory || {};
  return {
    dissonance: regulation.dissonanceLevel || 0,
    harmony: selfReg.harmonyPercentage || 50
  };
}

function regulatoryStubOf(agentId, input) {
  const regulation = input.cognitiveRegulation || {};
  return {
    agentId,
    revision: regulation.revision || 0,
    timestamp: nowIso(),
    drives: drivesStubOf(input),
    modulators: modulatorsStubOf(input),
    cognitive: balanceStubOf(input)
  };
}

function phenotypeStubOf(agentId, creativeState) {
  const recipe = creativeState || {};
  return {
    id: `pheno-${agentId}`,
    version: '1.0.0',
    timestamp: nowIso(),
    recipeId: recipe.recipeId || 'default',
    recipeVersion: recipe.version || '1.0.0',
    keys: recipe.keys || [],
    tensions: recipe.tensions || [],
    synthesisLevel: recipe.synthesisLevel || 'emerging',
    phase: recipe.phase || 'active',
    utility: recipe.utility || { coverage: 0, diversity: 0, cost: 0 },
    canMutate: recipe.canMutate !== false
  };
}

function trajectoryStubOf(agentId) {
  return {
    id: `traj-${agentId}`,
    version: '1.0.0',
    timestamp: nowIso(),
    phases: [],
    currentStrategy: 'default',
    previousStrategies: [],
    transitions: [],
    transitionReasons: [],
    outcomes: [],
    regret: { cumulative: 0, maxPossible: 0, perStrategy: {} },
    evidenceGain: { total: 0, byStrategy: {} },
    informationGain: { total: 0, byStrategy: {} },
    cost: { totalTokens: 0, totalCompute: 0, byStrategy: {} }
  };
}

module.exports = {
  realEpistemicOf,
  realRegulatoryOf,
  epistemicStubOf,
  memoryStubOf,
  regulatoryStubOf,
  phenotypeStubOf,
  trajectoryStubOf
};
