'use strict';

/**
 * CognitiveControlLoopService — cerveau de contrôle de la morphogenèse.
 *
 * Ferme les 5 systèmes dans une seule boucle causale :
 *   EpistemicState → MemoryContext → RegulatorySnapshot →
 *   CognitivePhenotype → StrategyTrajectory → Morphologie candidate.
 *
 * INVARIANTS :
 * - Memory ≠ truth (reuseScore module, ne promeut jamais seule).
 * - Hormones/drives MODULENT les poids, ne donnent jamais de permission.
 * - Curiosité haute ne contourne jamais un gate (conservation força).
 * - Incertitude peut augmenter après contradiction.
 */

const epistemicPressure = require('../epistemics/epistemicPressureService');
const regulatoryBridge = require('../regulation/regulatoryBridgeService');

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function pressureOf(expression) {
  try {
    const raw = expression?.epistemicState;
    if (!raw || !raw.claims) return null;
    const adapted = {
      agentId: expression.agentId || 'unknown',
      uncertaintyScore: 1 - clamp01(raw.confidence, 0.5),
      claims: raw.claims,
      contradictions: raw.contradictions || [],
      contradictionCount: (raw.contradictions || []).length,
      uncertainties: raw.uncertainties || [],
      knownUnknowns: raw.knownUnknowns || [],
      confidenceCalibration: { gap: raw.calibration?.calibrationError || 0 }
    };
    return epistemicPressure.computePressure(adapted);
  } catch (_) {
    return null;
  }
}

function hintOf(pressure) {
  try {
    return epistemicPressure.pressureToDecision(pressure);
  } catch (_) {
    return { decision: 'hold', reasons: ['pressure_unavailable'] };
  }
}

function memoryReuseOf(expression) {
  const ctx = expression?.memoryContext;
  if (!ctx) return 0;
  const facts = (ctx.relevantFacts || []).length;
  const episodes = (ctx.relevantEpisodes || []).length;
  const deadEnds = (ctx.knownDeadEnds || []).length;
  const reuse = (facts * 0.1 + episodes * 0.15) / 2;
  const penalty = Math.min(0.4, deadEnds * 0.05);
  return clamp01(reuse - penalty, 0);
}

function fitOf(candidate, expression) {
  const pheno = expression?.cognitivePhenotype;
  const traj = expression?.strategyTrajectory;
  const required = candidate.requiredCapabilities || [];
  const owned = pheno?.keys || pheno?.capabilities || [];
  const cognitive = required.length === 0 ? 0.5 : required.filter((c) => owned.includes(c)).length / required.length;
  const phase = traj?.currentStrategy || 'explore';
  const preferred = candidate.preferredPhase || 'any';
  const strategy = preferred === 'any' ? 0.5 : (preferred === phase ? 1 : 0.2);
  return { cognitive: clamp01(cognitive, 0.5), strategy };
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function benefitOf(candidate, ctx) {
  const pressureVal = ctx.pressure ? ctx.pressure.uncertainty : null;
  const progress = clamp01(pressureVal ? 1 - pressureVal.value : 0.3, 0.3);
  const gain = num(candidate.informationGain, 0.3) * 0.15 + num(candidate.evidenceGain, 0.3) * 0.15;
  const base = progress * 0.2 + gain + num(candidate.uncertaintyReduction, 0.2) * 0.1;
  const fitPart = ctx.fit.cognitive * 0.1 + ctx.fit.strategy * 0.1;
  const total = base + ctx.memoryReuse * 0.1 + fitPart + num(candidate.resilienceGain, 0) * 0.1;
  return total * (0.7 + ctx.weights.exploration * 0.3);
}

function costOf(candidate, ctx) {
  const parts = num(candidate.tokenCost, 0) * 0.25 + num(candidate.latency, 0) * 0.15;
  const trans = num(candidate.transitionCost, 0) * 0.2 + num(candidate.coordinationCost, 0) * 0.15;
  const risk = num(candidate.risk, 0.2) * (0.25 + ctx.weights.conservation * 0.5);
  return parts + trans + risk;
}

function scoreCandidate(candidate, ctx) {
  return Number((benefitOf(candidate, ctx) - costOf(candidate, ctx)).toFixed(4));
}

function trinityBonus(entry, hintObj) {
  const hint = hintObj ? hintObj.decision : 'hold';
  if (hint === 'seek_independent_verification') return 0.15;
  const secondary = hintObj && hintObj.secondaryHints ? hintObj.secondaryHints : [];
  if (secondary.includes('seek_independent_verification')) return 0.12;
  return null;
}

function bonusFor(entry, hintObj) {
  const trinity = trinityBonus(entry, hintObj);
  if (trinity !== null) return entry.candidate.topology === 'trinity' ? trinity : 0;
  const hint = hintObj ? hintObj.decision : 'hold';
  if (hint === 'explore') return entry.candidate.exploratory ? 0.1 : 0;
  if (hint === 'gather_evidence') return entry.candidate.evidenceOriented ? 0.1 : 0;
  return entry.candidate.stabilizing ? 0.08 : 0;
}

function applyTopologyBias(scored, ctx) {
  const hintObj = ctx.hint || { decision: 'hold' };
  return scored.map((entry) => {
    const bonus = bonusFor(entry, hintObj);
    return { ...entry, score: Number((entry.score + bonus).toFixed(4)), bias: bonus };
  });
}

function decideMorphology(opts) {
  const expression = opts?.expression || {};
  const candidates = Array.isArray(opts?.candidates) ? opts.candidates : [];
  if (candidates.length === 0) return { chosen: null, reason: 'no_candidates' };
  const pressure = pressureOf(expression);
  const hint = pressure ? hintOf(pressure) : { decision: 'hold', reasons: ['no_pressure'] };
  const weights = regulatoryBridge.modulationWeights(expression.regulatoryState);
  const memoryReuse = memoryReuseOf(expression);
  const scored = candidates.map((candidate) => {
    const fit = fitOf(candidate, expression);
    const score = scoreCandidate(candidate, { pressure, fit, memoryReuse, weights, hint });
    return { candidate, fit, score };
  });
  const biased = applyTopologyBias(scored, { hint });
  biased.sort((a, b) => b.score - a.score);
  const chosen = biased[0];
  const receipt = {
    type: 'MORPHOGENESIS_DECISION',
    timestamp: new Date().toISOString(),
    agentId: expression.agentId || 'unknown',
    cause: {
      dominantPressure: hint.dominantPressure || null,
      decision: hint.decision,
      overallPressure: pressure?.overallPressure ?? null
    },
    memory: { reuse: Number(memoryReuse.toFixed(3)) },
    weights,
    chosen: chosen.candidate.topology,
    score: chosen.score,
    alternatives: biased.slice(1, 3).map((e) => ({ topology: e.candidate.topology, score: e.score })),
    expected: { uncertaintyReduction: chosen.candidate.uncertaintyReduction ?? null }
  };
  return { chosen: chosen.candidate, scored: biased, hint, pressure, receipt };
}

module.exports = { decideMorphology, pressureOf, memoryReuseOf };
