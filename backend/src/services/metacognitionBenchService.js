'use strict';

/**
 * Banc métacognitif adversarial (calibration mesurée, pas déclarée).
 *
 * Lit l'historique réel d'attributions CoreSelf (confiance causale vs
 * erreur de prédiction) et calcule des métriques standard : ECE, Brier,
 * AUC type-2 (sensibilité métacognitive, Fleming & Lau) et surconfiance.
 * Le rapport persiste dans le self-model appris (extraWeaknesses, max 3,
 * resurfacées dans les prompts) et resserre le plancher d'opt-out via
 * abstentionService.floorFor. Faute de ≥ 10 essais : 'insufficient_data',
 * jamais de faux nombre.
 */

const selfModel = require('./selfModelService');
const coreSelf = require('./coreSelfService');

const MIN_TRIALS = 10;
const MAX_WEAKNESSES = 3;
const ECE_BINS = 5;

function pairsOf(entries) {
  return entries.map((entry) => ({
    confidence: Math.max(0, Math.min(1, Number(entry.causalConfidence) || 0)),
    correct: 1 - Math.max(0, Math.min(1, Number(entry.predictionError) || 0))
  }));
}

function eceOf(pairs) {
  const bins = Array.from({ length: ECE_BINS }, () => ({ confidence: 0, correct: 0, count: 0 }));
  for (const pair of pairs) {
    const slot = Math.min(ECE_BINS - 1, Math.floor(pair.confidence * ECE_BINS));
    bins[slot].confidence += pair.confidence;
    bins[slot].correct += pair.correct;
    bins[slot].count += 1;
  }
  let ece = 0;
  for (const bin of bins) {
    if (!bin.count) continue;
    ece += (bin.count / pairs.length) * Math.abs(bin.correct / bin.count - bin.confidence / bin.count);
  }
  return ece;
}

function brierOf(pairs) {
  if (!pairs.length) return 0;
  return pairs.reduce((total, pair) => total + (pair.confidence - pair.correct) ** 2, 0) / pairs.length;
}

function type2aucOf(pairs) {
  const good = pairs.filter((pair) => pair.correct >= 0.5).map((pair) => pair.confidence);
  const bad = pairs.filter((pair) => pair.correct < 0.5).map((pair) => pair.confidence);
  if (!good.length || !bad.length) return null;
  let wins = 0;
  for (const high of good) {
    for (const low of bad) {
      if (high > low) wins += 1;
      else if (high === low) wins += 0.5;
    }
  }
  return wins / (good.length * bad.length);
}

function weaknessesOf(report) {
  const weaknesses = [];
  if (report.overconfidence > 0.15) {
    weaknesses.push(`overconfident by ${report.overconfidence.toFixed(2)} on agency judgments`);
  }
  if (report.type2auc !== null && report.type2auc < 0.6) {
    weaknesses.push(`poor metacognitive resolution (type-2 AUC ${report.type2auc.toFixed(2)})`);
  }
  if (report.ece > 0.2) {
    weaknesses.push(`poorly calibrated confidence (ECE ${report.ece.toFixed(2)})`);
  }
  return weaknesses.slice(0, MAX_WEAKNESSES);
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

async function runBench(db, agentId, options) {
  const settings = options || {};
  if (!db || !agentId) return { status: 'insufficient_data', reason: 'missing agent', trials: 0 };
  try {
    const raw = Array.isArray(settings.entries) ? settings.entries : await entriesOf(db, agentId);
    const pairs = pairsOf(raw);
    if (pairs.length < MIN_TRIALS) return { status: 'insufficient_data', reason: 'too few trials', trials: pairs.length };
    const mean = (pick) => pairs.reduce((total, pair) => total + pick(pair), 0) / pairs.length;
    const report = {
      status: 'measured',
      agentId,
      trials: pairs.length,
      meanConfidence: round3(mean((pair) => pair.confidence)),
      meanCorrectness: round3(mean((pair) => pair.correct)),
      ece: round3(eceOf(pairs)),
      brier: round3(brierOf(pairs)),
      type2auc: type2aucOf(pairs) === null ? null : round3(type2aucOf(pairs)),
      overconfidence: round3(mean((pair) => pair.confidence) - mean((pair) => pair.correct)),
      measuredAt: new Date().toISOString()
    };
    report.weaknesses = weaknessesOf(report);
    await selfModel.mergeLearned(db, agentId, {
      metacognitionBench: report,
      extraWeaknesses: report.weaknesses
    });
    return report;
  } catch (_) {
    return { status: 'unavailable' };
  }
}

async function entriesOf(db, agentId) {
  const { AdaptiveStateService } = require('./adaptiveStateService');
  const stored = (await new AdaptiveStateService(db).restoreObject(coreSelf.SCOPE, agentId)) || {};
  return Array.isArray(stored.entries) ? stored.entries : [];
}

async function runBenchSafe(db, agentId) {
  try {
    return await runBench(db, agentId, {});
  } catch (_) {
    return null;
  }
}

module.exports = { runBench, runBenchSafe, MIN_TRIALS };
