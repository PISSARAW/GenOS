'use strict';

/**
 * Adaptive Worker Runtime — local autonomy without organizational authority.
 *
 * Gives workers:
 *   - Local Capability Resolver (which capabilities to use now)
 *   - Local strategy selection (which approach to take)
 *   - Escalation channel (request missing capabilities from orchestrator)
 *   - Local procedural memory (what worked before)
 *   - Internal plan reorganization
 *
 * Deliberately NOT allowed: spawn, promote, change global topology.
 */

const { resolveCapabilities, buildCapabilityManifest } = require('../capabilityResolverService');
const { requestCapability, findFallbacks } = require('../capabilityEscalationService');
const { recordOutcome, predictUtility } = require('../capabilityLearningService');

// ---------------------------------------------------------------------------
// Local procedural memory — per worker, capped
// ---------------------------------------------------------------------------

const MAX_TRIALS = 100;
const PROCEDURAL_MEMORY = new Map();

function getMemory(workerId) {
  if (!PROCEDURAL_MEMORY.has(workerId)) {
    PROCEDURAL_MEMORY.set(workerId, { trials: [], tacticHistory: [], evidenceHistory: [], capabilityHistory: [] });
  }
  return PROCEDURAL_MEMORY.get(workerId);
}

function pushCapped(arr, entry, cap) {
  arr.push(entry);
  if (arr.length > cap) arr.shift();
  return arr;
}

// ---------------------------------------------------------------------------
// Entropy & repetition detection
// ---------------------------------------------------------------------------

function computeEntropy(trials) {
  if (trials.length < 2) return 1;
  const counts = {};
  for (const t of trials) {
    const k = t.outcome || 'unknown';
    counts[k] = (counts[k] || 0) + 1;
  }
  const total = trials.length;
  let entropy = 0;
  for (const k in counts) {
    const p = counts[k] / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

function isStuck(mem) {
  const recent = mem.trials.slice(-5);
  if (recent.length < 3) return false;
  const entropy = computeEntropy(recent);
  const failures = recent.filter(t => t.outcome === 'failure').length;
  return entropy < 0.7 || failures >= 3;
}

function isRepeating(mem, tacticId) {
  const recent = mem.tacticHistory.slice(-3);
  return recent.length >= 2 && recent.every(h => h.tactic === tacticId);
}

// ---------------------------------------------------------------------------
// Local capability resolution
// ---------------------------------------------------------------------------

function localCapabilities(manifest) {
  const owned = manifest?.capabilityManifest?.owned || [];
  const expressed = (manifest?.capabilityManifest?.currently_expressed || []).map(e => e.id || e.capability_id);
  const suppressed = (manifest?.capabilityManifest?.suppressed || []).map(s => s.id);
  return {
    owned: new Set(owned),
    expressed: new Set(expressed),
    suppressed: new Set(suppressed)
  };
}

// ---------------------------------------------------------------------------
// Evidence analysis
// ---------------------------------------------------------------------------

function analyzeEvidence(result) {
  const delta = result?.evidence?.delta ?? 0;
  return {
    evidenceDelta: delta,
    isUseful: delta > 0,
    isNovel: result?.evidence?.novelty ?? 0.5,
    cost: result?.evidence?.cost ?? 0,
    entropy: result?.evidence?.entropy ?? 0.5
  };
}

// ---------------------------------------------------------------------------
// Tactic scoring
// ---------------------------------------------------------------------------

function scoreTactic(tactic, evidence, mem) {
  const prior = predictUtility({ conceptId: tactic.id || tactic.name, missionState: evidence.missionState });
  const reuseBonus = mem.trials.filter(t => t.tactic === tactic.id && t.outcome === 'success').length * 0.1;
  const recentPenalty = isRepeating(mem, tactic.id) ? 0.5 : 0;
  const infoGain = evidence.informationGain ?? 0.5;
  const risk = tactic.risk ?? 0.5;
  const reversibility = tactic.reversibility === 'high' ? 0.2 : tactic.reversibility === 'medium' ? 0.5 : 0.8;
  return prior + reuseBonus - recentPenalty + infoGain * 0.3 - risk * 0.2 - reversibility * 0.1;
}

// ---------------------------------------------------------------------------
// Public: createAdaptiveWorker
// ---------------------------------------------------------------------------

function createAdaptiveWorker(ctx) {
  const { agentId, manifest } = ctx;
  if (!agentId) throw new Error('createAdaptiveWorker requires agentId');

  const caps = localCapabilities(manifest);
  const mem = getMemory(agentId);

  return {
    agentId,
    capabilities: caps,
    memory: mem,
    handleResult: (resultCtx) => handleResult({ workerId: agentId, ...resultCtx }),
    maybeEscalate: (escCtx) => maybeEscalate({ workerId: agentId, ...escCtx }),
    reorganizePlan: (reorgCtx) => reorganizePlan({ workerId: agentId, ...reorgCtx }),
    selectTactic: (tacticCtx) => selectTactic({ workerId: agentId, ...tacticCtx }),
    isStuck: () => isStuck(mem),
    getStats: () => ({
      trials: mem.trials.length,
      entropy: Number(computeEntropy(mem.trials).toFixed(3)),
      lastOutcome: mem.trials[mem.trials.length - 1]?.outcome || null
    })
  };
}

// ---------------------------------------------------------------------------
// Public: handleResult — analyze evidence, learn, decide next action
// ---------------------------------------------------------------------------

function handleResult(ctx) {
  const { workerId, result, evidence } = ctx;
  const mem = getMemory(workerId);
  const analysis = analyzeEvidence(result);

  const trial = {
    outcome: analysis.isUseful ? 'success' : 'failure',
    tactic: result?.tactic || null,
    evidenceDelta: analysis.evidenceDelta,
    ts: Date.now()
  };
  pushCapped(mem.trials, trial, MAX_TRIALS);

  // Learn from outcome into capability learning store
  if (result?.capability) {
    recordOutcome({
      conceptId: result.capability,
      missionState: evidence?.missionState || {},
      wasUsed: true,
      wasUseful: analysis.isUseful,
      evidenceDelta: analysis.evidenceDelta,
      costIncurred: analysis.cost
    });
  }

  // Determine next action
  const action = isStuck(mem) ? 'change_tactic' : (result?.missingCapability ? 'escalate' : 'continue');

  return {
    action,
    shouldEscalate: action === 'escalate',
    missingCapability: result?.missingCapability || null,
    analysis,
    learned: Boolean(result?.capability),
    stuck: isStuck(mem)
  };
}

// ---------------------------------------------------------------------------
// Public: maybeEscalate — request missing capability from orchestrator
// ---------------------------------------------------------------------------

function maybeEscalate(ctx) {
  const { workerId, missingCapability, reason, evidence } = ctx;
  const mem = getMemory(workerId);

  // Check local fallbacks before escalating
  const fallbacks = findFallbacks(missingCapability);
  const localAvailable = fallbacks.filter(f => mem.capabilityHistory.some(c => c.capability === f && c.outcome === 'success'));

  if (localAvailable.length) {
    return { escalate: false, localFallbacks: localAvailable, message: 'Local fallback available' };
  }

  // Build escalation request
  const req = requestCapability({
    workerId,
    requestedCapability: missingCapability,
    reason,
    evidence: evidence || [],
    estimatedCost: evidence?.cost || 0
  });

  pushCapped(mem.capabilityHistory, { capability: missingCapability, request: req, outcome: 'requested', ts: Date.now() }, MAX_TRIALS);
  return { escalate: true, request: req, localFallbacks: [] };
}

// ---------------------------------------------------------------------------
// Public: reorganizePlan — internal plan reorganization based on new evidence
// ---------------------------------------------------------------------------

function reorganizePlan(ctx) {
  const { workerId, newEvidence, currentState } = ctx;
  const mem = getMemory(workerId);

  pushCapped(mem.evidenceHistory, newEvidence, MAX_TRIALS);

  const planFidelity = currentState?.planFidelity ?? 1.0;
  const evidenceCoherence = newEvidence?.coherence ?? 0.5;
  const needsReorg = planFidelity < 0.5 || evidenceCoherence < 0.4;

  if (!needsReorg) {
    return { reorganized: false, plan: currentState?.plan, reason: 'fidelity_ok' };
  }

  const steps = currentState?.plan?.steps || [];
  const remaining = steps.filter(s => !s.completed);

  const scoredSteps = remaining.map(step => ({
    ...step,
    predictedUtility: Number(predictUtility({ conceptId: step.capability || step.id, missionState: newEvidence.missionState }).toFixed(3))
  }));
  scoredSteps.sort((a, b) => b.predictedUtility - a.predictedUtility);

  return {
    reorganized: true,
    plan: { ...currentState?.plan, steps: [...steps.filter(s => s.completed), ...scoredSteps] },
    reason: 'evidence_driven_reorder',
    reordered: scoredSteps.length
  };
}

// ---------------------------------------------------------------------------
// Public: selectTactic — choose best tactic based on evidence & local memory
// ---------------------------------------------------------------------------

function selectTactic(ctx) {
  const { options, evidence, workerId } = ctx;
  if (!options || !options.length) return { tactic: null, reason: 'no_options', shouldEscalate: true };

  const mem = getMemory(workerId);
  let best = null;
  let bestScore = -Infinity;

  for (const opt of options) {
    const score = scoreTactic(opt, evidence, mem);
    if (score > bestScore) {
      bestScore = score;
      best = { ...opt, score: Number(score.toFixed(3)) };
    }
  }

  pushCapped(mem.tacticHistory, { tactic: best.id, ts: Date.now() }, MAX_TRIALS);
  return { tactic: best, reason: 'evidence_scored', shouldEscalate: false };
}

module.exports = {
  createAdaptiveWorker,
  handleResult,
  maybeEscalate,
  reorganizePlan,
  selectTactic
};
