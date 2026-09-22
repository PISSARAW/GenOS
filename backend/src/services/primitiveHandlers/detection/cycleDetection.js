/**
 * Semantic Loop Detector — Δ-information cycle detection
 *
 * Detects pathological loops not by topology (A→B→A) but by
 * information stagnation: when participants cycle without
 * reducing uncertainty, gaining evidence, or producing novel
 * artefacts.
 *
 * A loop is pathological when:
 *   same participants
 *   AND same semantic state (claims, artefacts, evidence hashes)
 *   AND no reduction in uncertainty
 *   AND no increase in evidence
 *   for N consecutive transitions.
 */

const { getDatabase } = require('../../../db');
const crypto = require('crypto');

function hashSemanticState(state) {
  const normalized = JSON.stringify(state || {});
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function extractSemanticSnapshot(message) {
  const payload = message.payload || message;
  const claims = (payload.claims || []).map((c) => c.statement || c).sort();
  const artefacts = (payload.artifacts || payload.artefacts || []).sort();
  const evidence = (payload.evidence || []).sort();
  const uncertainty = Number(payload.uncertainty ?? payload.uncertainties?.length ?? 1.0);
  return {
    claims,
    artefacts,
    evidence,
    uncertainty,
    claimCount: claims.length,
    artefactCount: artefacts.length,
    evidenceCount: evidence.length,
  };
}

function computeDeltaInformation(prev, curr) {
  const claimDelta = curr.claims.filter((c) => !prev.claims.includes(c)).length;
  const artefactDelta = curr.artefacts.filter((a) => !prev.artefacts.includes(a)).length;
  const evidenceDelta = curr.evidence.filter((e) => !prev.evidence.includes(e)).length;
  const uncertaintyReduction = prev.uncertainty - curr.uncertainty;
  return {
    claimDelta,
    artefactDelta,
    evidenceDelta,
    uncertaintyReduction,
    isNovel: claimDelta > 0 || artefactDelta > 0 || evidenceDelta > 0,
    isProgress: uncertaintyReduction > 0 || evidenceDelta > 0,
  };
}

function detectSemanticCycle(sequence, options = {}) {
  const windowSize = Math.max(2, Math.min(options.windowSize || 6, Math.floor(sequence.length / 2)));
  const minStagnantRounds = Math.max(2, options.minStagnantRounds || 3);

  if (sequence.length < windowSize * 2) {
    return { hasCycle: false, reason: 'INSUFFICIENT_HISTORY' };
  }

  let stagnantRounds = 0;
  const stagnantParticipants = new Set();
  const deltas = [];

  for (let i = windowSize; i < sequence.length; i++) {
    const prev = extractSemanticSnapshot(sequence[i - windowSize]);
    const curr = extractSemanticSnapshot(sequence[i]);
    const delta = computeDeltaInformation(prev, curr);
    deltas.push(delta);

    if (!delta.isNovel && !delta.isProgress) {
      stagnantRounds++;
      const participants = sequence.slice(i - windowSize, i + 1).map((m) => m.from || m.sender || m.agentId || m.actor || '?');
      participants.forEach((p) => stagnantParticipants.add(p));
    } else {
      stagnantRounds = 0;
      stagnantParticipants.clear();
    }

    if (stagnantRounds >= minStagnantRounds) {
      return {
        hasCycle: true,
        loopType: 'semantic_stagnation',
        cycleParticipants: [...stagnantParticipants],
        detectedCycle: sequence.slice(i - stagnantRounds, i + 1).map((m) => m.action || m.tool || m.eventType || '?'),
        budgetPenalized: 0,
        recommendation: 'Loop stagnation detected — no information gain across N transitions. Inject novel evidence or terminate cycle.',
        deltas: deltas.slice(-stagnantRounds - 1),
      };
    }
  }

  return { hasCycle: false, deltas };
}

async function penalizeBudget(db, targetAgentId, cycleParticipants = []) {
  let budgetPenalized = 0;
  try {
    const targets = targetAgentId
      ? [targetAgentId]
      : (Array.isArray(cycleParticipants) ? cycleParticipants.filter(Boolean) : []);
    for (const agentId of targets) {
      const res = await db.run("UPDATE agents SET cognitive_budget = MAX(0, COALESCE(cognitive_budget, 100) - 15) WHERE id = ?", agentId);
      if (res && typeof res.changes === 'number') {
        if (res.changes > 0) budgetPenalized += 15;
      } else {
        budgetPenalized += 15;
      }
    }
  } catch (_) {}
  return budgetPenalized;
}

async function cycleDetection(context = {}) {
  const rawMessages = context.messages || context.turns || context.history || [];
  const maxRepeats = Number.isInteger(context.maxRepeats) ? context.maxRepeats : 2;

  const seqResult = detectSemanticCycle(rawMessages, {
    windowSize: context.windowSize || 6,
    minStagnantRounds: context.minStagnantRounds || 3,
  });

  if (!seqResult.hasCycle) {
    return {
      success: true,
      hasCycle: false,
      action: 'CONTINUE',
      intervention: false,
      loopType: 'none',
      cycleParticipants: [],
      detectedCycle: null,
      budgetPenalized: 0,
      recommendation: 'No semantic loop detected',
      deltas: seqResult.deltas || [],
    };
  }

  let budgetPenalized = 0;
  if (context.db) {
    budgetPenalized = await penalizeBudget(
      context.db,
      context.agentId || context.targetId,
      seqResult.cycleParticipants
    );
  }

  const telemetry = require('../../telemetryObserver');
  telemetry.emitEvent({
    eventType: 'SEMANTIC_LOOP_DETECTED',
    agentId: context.agentId || context.orchestratorId || 'strategy_adapter',
    action: 'BREAK_LOOP',
    detail: `Semantic stagnation: ${seqResult.cycleParticipants.join(' <-> ')} cycled without information gain`,
    severity: 'warning',
    payload: {
      loopType: seqResult.loopType,
      cycleParticipants: seqResult.cycleParticipants,
      detectedCycle: seqResult.detectedCycle,
      budgetPenalized,
      deltas: seqResult.deltas,
    },
  });

  return {
    success: true,
    hasCycle: true,
    action: 'BREAK_LOOP',
    intervention: true,
    loopType: seqResult.loopType,
    cycleParticipants: seqResult.cycleParticipants,
    detectedCycle: seqResult.detectedCycle,
    budgetPenalized,
    recommendation: seqResult.recommendation,
    deltas: seqResult.deltas,
  };
}

module.exports = { cycleDetection, detectSemanticCycle, computeDeltaInformation, penalizeBudget, extractSemanticSnapshot };
