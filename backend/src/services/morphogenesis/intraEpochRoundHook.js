'use strict';

/**
 * Pont intra-époque pour les boucles d'orchestration.
 * Délègue au service d'adaptation et applique les modulations bornées au
 * runtime local actif. Les mutations structurelles restent à la barrière.
 */

function signalFromEvent(input) {
  const payload = input.event?.payload || {};
  const report = payload.evidenceReport || payload.evidence_report || {};
  const confidence = Number(report.confidence ?? payload.confidence);
  const score = Number(payload.evidenceScore ?? payload.evidence_score);
  const warning = ['warning', 'error', 'critical'].includes(String(input.event?.severity || '').toLowerCase());
  const normalizedConfidence = normalizeUnit(confidence);
  const normalizedScore = normalizeUnit(score);
  const base = uncertaintyFor(normalizedConfidence, normalizedScore, warning);
  return { kind: 'progress', uncertainty: base };
}

function normalizeUnit(value) {
  if (!Number.isFinite(value)) return null;
  return value > 1 ? value / 100 : value;
}

function uncertaintyFor(confidence, score, warning) {
  if (Number.isFinite(confidence)) return 1 - confidence;
  if (Number.isFinite(score)) return Math.max(0, Math.min(1, 1 - score));
  return warning ? 0.75 : 0;
}

function deliverAttention(input, ticked) {
  const attention = ticked?.modulation?.attention;
  if (!input.agentId || attention?.mode === 'hold') return false;
  const child = require('../agentOrchestrationState').activeProcesses.get(input.agentId);
  if (!child?.connected || !child.genosCaptureBarrier || !child.genosExecutionRunId) return false;
  try {
    child.send({ type: 'genos-intra-epoch-modulation', agentId: input.agentId,
      runId: child.genosExecutionRunId, revision: ticked.revision,
      mode: attention.mode, strength: attention.strength,
      reason: attention.reason });
    return true;
  } catch (_) {
    return false;
  }
}

function emitModulation(input, ticked, queued) {
  if (!ticked || !input.emit) return;
  input.emit(ticked.orchestratorId, 'MORPHOGENESIS_INTRA_EPOCH_QUEUED', 'MORPHOGENESIS',
    queued ? 'Intra-epoch attention modulation queued for the active worker.'
      : 'Intra-epoch modulation recorded; no compatible active runtime accepted it.',
    { epoch: ticked.epoch, revision: ticked.revision, queued,
      workerId: input.agentId || null, modulation: ticked.modulation }, 'info');
}

function tickCollecting(input) {
  try {
    if (!input.state || input.state.advanced) return null;
    const orchestratorId = input.mission?.budgetRound?.orchestratorId;
    if (!orchestratorId) return null;
    const intra = require('./intraEpochAdaptationService');
    const ticked = intra.observeWorkerSignal({ orchestratorId,
      epoch: Number(input.state.epoch || 0), signal: signalFromEvent(input) });
    if (!ticked) return null;
    const queued = deliverAttention({ ...input, agentId: input.mission?.agentId }, ticked);
    emitModulation({ ...input, agentId: input.mission?.agentId }, ticked, queued);
    return ticked;
  } catch (_) {
    return null;
  }
}

function observeExternal(input) {
  try {
    const intra = require('./intraEpochAdaptationService');
    const ticked = intra.observeWorkerSignal(input);
    if (!ticked) return null;
    const queued = deliverAttention(input, ticked);
    emitModulation(input, ticked, queued);
    return ticked;
  } catch (_) {
    return null;
  }
}

function attachObservations(input) {
  try {
    const intra = require('./intraEpochAdaptationService');
    const observations = intra.drainEpochObservations(input);
    if (observations && input.state) input.state.intraEpochObservations = observations;
    if (observations) intra.resetEpoch({ orchestratorId: input.orchestratorId,
      epoch: Number(input?.epoch ?? input?.state?.epoch ?? 0) });
    return observations;
  } catch (_) {
    return null;
  }
}

function observeRuntimeEvent(input) {
  try {
    const round = input.mission?.budgetRound;
    if (!round?.orchestratorId || input.event?.status === 'completed') return null;
    return observeExternal({ orchestratorId: round.orchestratorId,
      epoch: Number(round.epoch || 0), agentId: input.agentId,
      signal: signalFromEvent(input), emit: input.emit });
  } catch (_) {
    return null;
  }
}

module.exports = { signalFromEvent, tickCollecting, observeExternal, attachObservations,
  observeRuntimeEvent, deliverAttention };
