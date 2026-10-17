'use strict';

/**
 * Adaptation intra-époque : boucle rapide/structurelle/évolutive en continu.
 *
 * Garanties :
 * - Les structures locales de raisonnement peuvent changer à un point sûr de
 *   génération (checkpoint, abandon de la réponse obsolète, régénération).
 * - Les changements collectifs de kind/topologie/lease restent à la barrière.
 * - Ne bloque jamais un échange porteur de preuve (claims/evidence/receipt).
 * - Best-effort, borné et idempotent : échec silencieux, jamais d'exception.
 */

const MAX_MODULATIONS_PER_EPOCH = 5;
const MIN_TICK_INTERVAL_MS = 500;
const MIN_SAMPLES = 10;
const MIN_REDUNDANCY_RATIO = 0.2;
const UNCERTAINTY_REFOCUS_THRESHOLD = 0.6;
const INFERENCE_STRUCTURE_TYPES = new Set([
  'reasoning_representation', 'phase_order', 'tool_sequence'
]);

const EVIDENCE_BEARING_KINDS = new Set([
  'evidence', 'claim', 'evidence_report', 'receipt', 'proof', 'verification',
  'success', 'critical', 'handoff'
]);

const epochs = new Map();

function nowMs() {
  return Date.now();
}

function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function epochKey(input) {
  return `${input.orchestratorId}::${input.epoch}`;
}

function getEpochRecord(input) {
  const key = epochKey(input);
  let record = epochs.get(key);
  if (!record) {
    record = { digests: new Set(), attempts: 0, redundant: 0,
      modulations: 0, lastTickMs: 0, attentionHint: null,
      throttle: null, observations: [] };
    epochs.set(key, record);
  }
  return record;
}

function isEvidenceBearing(input) {
  const kind = String(input.kind || '').toLowerCase();
  const signalType = String(input.signalType || '').toLowerCase();
  if (EVIDENCE_BEARING_KINDS.has(kind)) return true;
  if (EVIDENCE_BEARING_KINDS.has(signalType)) return true;
  return Boolean(input.evidenceRefs) || Boolean(input.receiptId);
}

function digestExchange(input) {
  try {
    const body = { kind: input.kind || null, signalType: input.signalType || null,
      digest: input.digest || null, payloadHash: input.payloadHash || null };
    if (!body.kind && !body.signalType && !body.digest && !body.payloadHash) return null;
    return JSON.stringify(body);
  } catch (_) {
    return null;
  }
}

function decideAttention(input) {
  const uncertainty = clamp01(input.uncertainty);
  if (uncertainty >= UNCERTAINTY_REFOCUS_THRESHOLD) {
    return { mode: 'refocus_diagnostics', target: 'diagnostics',
      strength: Math.max(0.55, uncertainty), advisoryOnly: false,
      reason: 'high_uncertainty_requires_targeted_diagnostics' };
  }
  return { mode: 'hold', target: 'action_plan', strength: 0.5,
    advisoryOnly: true, reason: 'uncertainty_within_execution_range' };
}

function decideExchangeThrottle(input) {
  const attempts = Number(input.attempts || 0);
  const redundant = Number(input.redundant || 0);
  if (!Number.isSafeInteger(attempts) || !Number.isSafeInteger(redundant)) {
    return { mode: 'pass', advisoryOnly: true, reason: 'insufficient_samples' };
  }
  if (attempts < MIN_SAMPLES) {
    return { mode: 'pass', advisoryOnly: true, reason: 'insufficient_samples' };
  }
  const ratio = redundant / Math.max(1, attempts);
  if (ratio < MIN_REDUNDANCY_RATIO) {
    return { mode: 'pass', advisoryOnly: true, reason: 'redundancy_below_threshold' };
  }
  return { mode: 'throttle_redundant_only', advisoryOnly: false,
    reason: 'redundant_coordination_detected', redundancyRatio: ratio,
    scope: 'non_evidence_coordination_only' };
}

function decideStructural(input) {
  const proposal = normalizeStructuralProposal(input.proposal);
  if (proposal) return { mode: 'safe_point_restart', advisoryOnly: false,
    reason: 'versioned_inference_structure_change', proposal };
  if (input.proposal) return { mode: 'deferred_to_barrier', advisoryOnly: true,
    reason: 'collective_structural_change_requires_quiescence' };
  return { mode: 'deferred_to_barrier', advisoryOnly: true,
    reason: 'no_structural_proposal' };
}

function normalizeStructuralProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return null;
  const type = String(proposal.type || '').toLowerCase();
  const target = String(proposal.target || '').trim();
  const evidenceRef = String(proposal.evidenceRef || '').trim();
  if (!INFERENCE_STRUCTURE_TYPES.has(type) || !target || !evidenceRef) return null;
  return { type, target: target.slice(0, 120), evidenceRef: evidenceRef.slice(0, 160) };
}

function decideEvolutive(input) {
  return { mode: 'observe_only', advisoryOnly: true,
    reason: 'learning_consolidated_at_barrier_only',
    sampleCount: Number(input.attempts || 0) };
}

function decideModulation(input) {
  const snapshot = input.snapshot || {};
  const attention = decideAttention({ uncertainty: snapshot.uncertainty });
  const exchanges = decideExchangeThrottle({ attempts: snapshot.attempts, redundant: snapshot.redundant });
  const structural = decideStructural({ proposal: snapshot.structuralProposal || null });
  const evolutive = decideEvolutive({ attempts: snapshot.attempts });
  const active = attention.mode !== 'hold' || exchanges.mode !== 'pass'
    || structural.mode === 'safe_point_restart';
  return { active, attention, exchanges, structural, evolutive,
    appliedImmediately: { attention: false,
      exchanges: exchanges.mode !== 'pass', structural: false },
    mutatedWorker: false, revokedLease: false, changedTopology: false };
}

function rateLimited(record) {
  if (record.modulations >= MAX_MODULATIONS_PER_EPOCH) return true;
  return (nowMs() - record.lastTickMs) < MIN_TICK_INTERVAL_MS;
}

function trackExchange(record, input) {
  const signal = input.signal || {};
  if (signal.kind !== 'exchange') return;
  if (isEvidenceBearing(signal)) return;
  const digest = digestExchange(signal) || String(signal.digest || signal.payloadHash || '');
  if (!digest) {
    record.attempts += 1;
    return;
  }
  record.attempts += 1;
  if (record.digests.has(digest)) {
    record.redundant += 1;
  } else {
    record.digests.add(digest);
  }
}

function buildSnapshot(record, input) {
  const signal = input.signal || {};
  return { attempts: record.attempts, redundant: record.redundant,
    uncertainty: clamp01(signal.uncertainty ?? input.uncertainty ?? 0),
    structuralProposal: signal.structuralProposal || null };
}

function storeModulation(record, modulation) {
  record.modulations += 1;
  record.lastTickMs = nowMs();
  record.attentionHint = modulation.attention;
  record.throttle = modulation.exchanges;
  record.observations.push({ at: new Date().toISOString(),
    attention: modulation.attention.mode, exchanges: modulation.exchanges.mode,
    structural: modulation.structural.mode });
  if (record.observations.length > 20) record.observations.shift();
  return record.modulations;
}

function observeWorkerSignal(input) {
  try {
    if (!input || !input.orchestratorId) return null;
    const record = getEpochRecord({ orchestratorId: input.orchestratorId, epoch: input.epoch || 0 });
    trackExchange(record, input);
    if (rateLimited(record)) return null;
    const modulation = decideModulation({ snapshot: buildSnapshot(record, input) });
    if (!modulation.active) return null;
    const revision = storeModulation(record, modulation);
    return { orchestratorId: input.orchestratorId, epoch: input.epoch || 0,
      revision, modulation };
  } catch (_) {
    return null;
  }
}

function gateExchange(input) {
  try {
    if (isEvidenceBearing(input)) {
      return { throttled: false, reason: 'evidence_bearing_never_throttled' };
    }
    const record = getEpochRecord(input);
    const signal = { ...input, kind: 'exchange' };
    const digest = digestExchange(signal);
    const redundant = Boolean(digest && record.digests.has(digest));
    observeWorkerSignal({ orchestratorId: input.orchestratorId, epoch: input.epoch,
      signal });
    const decision = throttleFor(input);
    if (!redundant || !decision.throttled) {
      return { throttled: false, reason: redundant ? decision.reason : 'novel_exchange' };
    }
    return { ...decision, duplicateDigest: digest };
  } catch (_) {
    return { throttled: false, reason: 'gate_failed_open' };
  }
}

function throttleFor(input) {
  try {
    const record = epochs.get(epochKey({ orchestratorId: input.orchestratorId, epoch: input.epoch || 0 }));
    if (!record || !record.throttle) return { throttled: false, reason: 'no_throttle' };
    if (isEvidenceBearing(input)) return { throttled: false, reason: 'evidence_bearing_never_throttled' };
    if (record.throttle.mode === 'pass') return { throttled: false, reason: record.throttle.reason };
    return { throttled: true, advisoryOnly: false, reason: record.throttle.reason,
      redundancyRatio: record.throttle.redundancyRatio || null };
  } catch (_) {
    return { throttled: false, reason: 'observer_failed' };
  }
}

function attentionHintFor(input) {
  try {
    const record = epochs.get(epochKey({ orchestratorId: input.orchestratorId, epoch: input.epoch || 0 }));
    return record?.attentionHint || null;
  } catch (_) {
    return null;
  }
}

function drainEpochObservations(input) {
  try {
    const record = epochs.get(epochKey({ orchestratorId: input.orchestratorId, epoch: input.epoch || 0 }));
    if (!record) return null;
    return { attempts: record.attempts, redundant: record.redundant,
      modulations: record.modulations, observations: [...record.observations],
      attentionHint: record.attentionHint, throttle: record.throttle };
  } catch (_) {
    return null;
  }
}

function resetEpoch(input) {
  epochs.delete(epochKey({ orchestratorId: input.orchestratorId, epoch: input.epoch || 0 }));
}

function clearAll() {
  epochs.clear();
}

module.exports = { MAX_MODULATIONS_PER_EPOCH, MIN_TICK_INTERVAL_MS,
  MIN_SAMPLES, MIN_REDUNDANCY_RATIO, UNCERTAINTY_REFOCUS_THRESHOLD,
  INFERENCE_STRUCTURE_TYPES,
  isEvidenceBearing, digestExchange, decideAttention, decideExchangeThrottle,
  decideStructural, normalizeStructuralProposal, decideEvolutive, decideModulation, observeWorkerSignal,
  gateExchange, throttleFor, attentionHintFor, drainEpochObservations,
  resetEpoch, clearAll };
