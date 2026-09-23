'use strict';

/**
 * Cognitive Self Runtime — incremental self-model refresh at checkpoints.
 *
 * Instead of rebuilding the full CognitiveSelf at every checkpoint (expensive),
 * this service computes only what changed since the last checkpoint and produces
 * a SelfDelta for provenance tracking.
 *
 * Checkpoint events:
 *   MISSION_START, EVIDENCE_RECEIVED, BLOCKER_DETECTED, STRATEGY_FAILURE,
 *   CAPABILITY_REQUEST, MORPHOGENESIS_PROPOSED, MORPHOGENESIS_COMPLETED,
 *   BEFORE_TERMINATION
 *
 * SelfDelta structure:
 *   changedCapabilities, changedConfidence, newWeaknesses, newRelations,
 *   regulationDelta, resourceDelta, epistemicDelta
 */

const MAX_DELTA_TOKENS = 2000;
const TOKEN_ESTIMATE_FACTOR = 4;
const MAX_STORED_DELTAS = 100;

const CHECKPOINTS = new Set([
  'MISSION_START',
  'EVIDENCE_RECEIVED',
  'BLOCKER_DETECTED',
  'STRATEGY_FAILURE',
  'CAPABILITY_REQUEST',
  'MORPHOGENESIS_PROPOSED',
  'MORPHOGENESIS_COMPLETED',
  'BEFORE_TERMINATION'
]);

// agentId -> { self, deltas: [], lastCheckpoint }
const selfStore = new Map();

// ---------------------------------------------------------------------------
// SelfDelta factory
// ---------------------------------------------------------------------------

function createSelfDelta() {
  return {
    changedCapabilities: [],
    changedConfidence: {},
    newWeaknesses: [],
    newRelations: [],
    regulationDelta: {},
    resourceDelta: {},
    epistemicDelta: {},
    checkpoint: null,
    timestamp: null,
    agentId: null
  };
}

// ---------------------------------------------------------------------------
// Load or build CognitiveSelf from db
// ---------------------------------------------------------------------------

async function loadOrBuildSelf(db, agentId) {
  const row = await db.get('SELECT * FROM agents WHERE id = ?', agentId);
  if (!row) {
    throw new Error(`Agent ${agentId} not found`);
  }
  return {
    identity: {
      id: row.id,
      name: row.name,
      role: row.role,
      generation: row.generation,
      parents: safeParse(row.parents),
      inheritedTraits: safeParse(row.inherited_traits)
    },
    regulatory: {
      dissonanceLevel: num(row.dissonance_level),
      cognitiveBudget: num(row.cognitive_budget),
      baselineBudget: num(row.cognitive_baseline_budget),
      maxDissonance: num(row.cognitive_max_dissonance),
      isApoptotic: Boolean(row.is_apoptotic),
      eurekaCount: num(row.eureka_count)
    },
    operational: {
      capabilities: [],
      confidence: {},
      knownWeaknesses: [],
      tools: []
    },
    autobiographical: {
      episodeCount: 0,
      lessonCount: 0,
      lessons: [],
      turningPoints: []
    },
    updatedAt: row.updated_at
  };
}

function safeParse(val) {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

function num(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Delta computation
// ---------------------------------------------------------------------------

function computeSelfDelta(context) {
  const { prev, current, checkpoint, event } = context;
  const delta = createSelfDelta();

  if (!prev) {
    delta.changedCapabilities = current.operational.capabilities.slice();
    delta.changedConfidence = { ...current.operational.confidence };
    delta.newWeaknesses = current.operational.knownWeaknesses.slice();
    delta.regulationDelta = {
      dissonanceLevel: current.regulatory.dissonanceLevel,
      cognitiveBudget: current.regulatory.cognitiveBudget,
      isApoptotic: current.regulatory.isApoptotic
    };
    delta.resourceDelta = {
      cognitiveBudget: current.regulatory.cognitiveBudget,
      baselineBudget: current.regulatory.baselineBudget
    };
    delta.epistemicDelta = {
      eurekaCount: current.regulatory.eurekaCount,
      episodeCount: current.autobiographical.episodeCount
    };
    return delta;
  }

  delta.changedCapabilities = diffArrays(prev.operational.capabilities, current.operational.capabilities);
  delta.changedConfidence = diffObjects(prev.operational.confidence, current.operational.confidence);
  delta.newWeaknesses = diffArrays(prev.operational.knownWeaknesses, current.operational.knownWeaknesses);
  delta.regulationDelta = {
    dissonanceLevel: current.regulatory.dissonanceLevel - prev.regulatory.dissonanceLevel,
    cognitiveBudget: current.regulatory.cognitiveBudget - prev.regulatory.cognitiveBudget,
    isApoptotic: current.regulatory.isApoptotic !== prev.regulatory.isApoptotic
      ? current.regulatory.isApoptotic : undefined
  };
  delta.resourceDelta = {
    cognitiveBudget: current.regulatory.cognitiveBudget - prev.regulatory.cognitiveBudget,
    baselineBudget: current.regulatory.baselineBudget - prev.regulatory.baselineBudget
  };
  delta.epistemicDelta = {
    eurekaCount: current.regulatory.eurekaCount - prev.regulatory.eurekaCount,
    episodeCount: current.autobiographical.episodeCount - prev.autobiographical.episodeCount
  };
  return delta;
}

function diffArrays(prev, current) {
  const prevSet = new Set(prev || []);
  return (current || []).filter(x => !prevSet.has(x));
}

function diffObjects(prev, current) {
  const result = {};
  const prevObj = prev || {};
  const currObj = current || {};
  for (const key of Object.keys(currObj)) {
    if (prevObj[key] !== currObj[key]) {
      result[key] = currObj[key];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Checkpoint-specific handlers
// ---------------------------------------------------------------------------

async function applyMissionStartUpdates(context) {
  const { delta, event } = context;
  delta.epistemicDelta.missionStarted = true;
  if (event?.missionId) delta.epistemicDelta.missionId = event.missionId;
  return delta;
}

async function applyEvidenceReceivedUpdates(context) {
  const { delta, event } = context;
  delta.epistemicDelta.evidenceReceived = true;
  if (event?.evidenceId) delta.epistemicDelta.evidenceId = event.evidenceId;
  if (event?.evidenceType) delta.epistemicDelta.evidenceType = event.evidenceType;
  return delta;
}

async function applyBlockerDetectedUpdates(context) {
  const { delta, event } = context;
  delta.newWeaknesses.push(`blocker:${event?.blockerType || 'unknown'}`);
  delta.regulationDelta.blockerDetected = true;
  return delta;
}

async function applyStrategyFailureUpdates(context) {
  const { delta, event } = context;
  delta.newWeaknesses.push(`strategy_failure:${event?.strategy || 'unknown'}`);
  delta.regulationDelta.strategyFailed = true;
  if (event?.failureReason) delta.regulationDelta.failureReason = event.failureReason;
  return delta;
}

async function applyCapabilityRequestUpdates(context) {
  const { delta, event } = context;
  if (event?.requestedCapabilities) {
    delta.changedCapabilities = delta.changedCapabilities.concat(
      event.requestedCapabilities.filter(c => !delta.changedCapabilities.includes(c))
    );
  }
  return delta;
}

async function applyMorphogenesisProposedUpdates(context) {
  const { delta, event } = context;
  delta.regulationDelta.morphogenesisProposed = true;
  if (event?.proposalId) delta.regulationDelta.proposalId = event.proposalId;
  return delta;
}

async function applyMorphogenesisCompletedUpdates(context) {
  const { delta, event } = context;
  delta.regulationDelta.morphogenesisCompleted = true;
  if (event?.morphologicalChanges) delta.regulationDelta.morphologicalChanges = event.morphologicalChanges;
  return delta;
}

async function applyBeforeTerminationUpdates(context) {
  const { delta, self } = context;
  delta.regulationDelta.terminationImminent = true;
  delta.epistemicDelta.finalState = {
    dissonanceLevel: self.regulatory.dissonanceLevel,
    cognitiveBudget: self.regulatory.cognitiveBudget,
    isApoptotic: self.regulatory.isApoptotic
  };
  return delta;
}

const checkpointHandlers = {
  MISSION_START: applyMissionStartUpdates,
  EVIDENCE_RECEIVED: applyEvidenceReceivedUpdates,
  BLOCKER_DETECTED: applyBlockerDetectedUpdates,
  STRATEGY_FAILURE: applyStrategyFailureUpdates,
  CAPABILITY_REQUEST: applyCapabilityRequestUpdates,
  MORPHOGENESIS_PROPOSED: applyMorphogenesisProposedUpdates,
  MORPHOGENESIS_COMPLETED: applyMorphogenesisCompletedUpdates,
  BEFORE_TERMINATION: applyBeforeTerminationUpdates
};

// ---------------------------------------------------------------------------
// Delta size cap
// ---------------------------------------------------------------------------

function estimateTokens(obj) {
  return Math.ceil(JSON.stringify(obj).length / TOKEN_ESTIMATE_FACTOR);
}

function capDeltaSize(delta) {
  if (estimateTokens(delta) <= MAX_DELTA_TOKENS) return delta;
  const capped = { ...delta };
  while (estimateTokens(capped) > MAX_DELTA_TOKENS && hasTrimableContent(capped)) {
    if (capped.changedCapabilities.length > 1) {
      capped.changedCapabilities = capped.changedCapabilities.slice(0, Math.ceil(capped.changedCapabilities.length / 2));
    } else if (capped.newWeaknesses.length > 1) {
      capped.newWeaknesses = capped.newWeaknesses.slice(0, Math.ceil(capped.newWeaknesses.length / 2));
    } else if (capped.newRelations.length > 1) {
      capped.newRelations = capped.newRelations.slice(0, Math.ceil(capped.newRelations.length / 2));
    } else {
      capped.regulationDelta = {};
      capped.resourceDelta = {};
      capped.epistemicDelta = {};
    }
  }
  return capped;
}

function hasTrimableContent(delta) {
  return delta.changedCapabilities.length > 1 ||
    delta.newWeaknesses.length > 1 ||
    delta.newRelations.length > 1 ||
    Object.keys(delta.regulationDelta).length > 0 ||
    Object.keys(delta.resourceDelta).length > 0 ||
    Object.keys(delta.epistemicDelta).length > 0;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function storeDelta(agentId, delta, self) {
  if (!selfStore.has(agentId)) {
    selfStore.set(agentId, { self, deltas: [], lastCheckpoint: null });
  }
  const entry = selfStore.get(agentId);
  entry.self = self;
  entry.lastCheckpoint = delta.checkpoint;
  entry.deltas.push(delta);
  if (entry.deltas.length > MAX_STORED_DELTAS) {
    entry.deltas = entry.deltas.slice(-MAX_STORED_DELTAS);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function refreshSelf(ctx) {
  const { agentId, checkpoint, event, db } = ctx;
  if (!agentId || !checkpoint || !db) {
    throw new Error('refreshSelf requires agentId, checkpoint, and db');
  }
  if (!CHECKPOINTS.has(checkpoint)) {
    throw new Error(`Unknown checkpoint: ${checkpoint}`);
  }
  const currentSelf = await loadOrBuildSelf(db, agentId);
  const prevEntry = selfStore.get(agentId);
  const prevSelf = prevEntry ? prevEntry.self : null;
  let delta = computeSelfDelta({ prev: prevSelf, current: currentSelf, checkpoint, event });
  const handler = checkpointHandlers[checkpoint];
  if (handler) {
    delta = await handler({ delta, self: currentSelf, event, db });
  }
  delta = capDeltaSize(delta);
  delta.checkpoint = checkpoint;
  delta.timestamp = new Date().toISOString();
  delta.agentId = agentId;
  storeDelta(agentId, delta, currentSelf);
  return delta;
}

function getSelfDelta(agentId) {
  const entry = selfStore.get(agentId);
  if (!entry || !entry.deltas || entry.deltas.length === 0) {
    return createSelfDelta();
  }
  return entry.deltas[entry.deltas.length - 1];
}

function resetSelfDelta(agentId) {
  selfStore.delete(agentId);
}

module.exports = {
  refreshSelf,
  getSelfDelta,
  resetSelfDelta,
  createSelfDelta,
  CHECKPOINTS,
  MAX_DELTA_TOKENS
};
