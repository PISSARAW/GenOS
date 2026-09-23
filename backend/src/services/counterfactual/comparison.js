'use strict';

const crypto = require('crypto');
const { computeNecessity } = require('../../services/causalityService');

function uuid() { return crypto.randomUUID(); }
function nowIso() { return new Date().toISOString(); }

function getWorldMetrics(worldId, experiments) {
  const exps = Array.from(experiments.values()).filter(e => e.world_id === worldId);
  if (exps.length === 0) return { score: 0, success: false };
  try {
    const m = JSON.parse(exps[exps.length - 1].metrics_json);
    return { score: m.score || 0, success: m.success || false };
  } catch (_) { return { score: 0, success: false }; }
}

function computeNormalizedEffect(delta, baseline) {
  if (baseline !== 0) return delta / baseline;
  return delta > 0 ? 1 : delta < 0 ? -1 : 0;
}

function buildResult(world, baseline, metrics) {
  const ne = metrics.ne;
  const necessity = metrics.necessity;
  return {
    id: 'cfr_' + uuid(), experiment_id: null, world_id: world.id,
    baseline_world_id: baseline ? baseline.id : null,
    metric_name: 'composite_score',
    metric_value: metrics.wmScore, baseline_value: metrics.baseScore,
    delta: metrics.delta, normalized_effect: ne,
    confidence: necessity.verdict === 'necessary' ? 0.9 : 0.5,
    rank: 0, is_winner: 0, promotion_receipt_json: '{}',
    created_at: nowIso(),
  };
}

async function persistResult(db, res) {
  if (db) {
    db.run(
      `INSERT INTO counterfactual_results
       (id, experiment_id, world_id, baseline_world_id, metric_name,
        metric_value, baseline_value, delta, normalized_effect, confidence,
        rank, is_winner, promotion_receipt_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [res.id, res.experiment_id, res.world_id, res.baseline_world_id,
       res.metric_name, res.metric_value, res.baseline_value, res.delta,
       res.normalized_effect, res.confidence, res.rank, res.is_winner,
       res.promotion_receipt_json, res.created_at]);
  }
}

function updateRank(db, result, rank) {
  result.rank = rank;
  if (db) db.run(`UPDATE counterfactual_results SET rank = ? WHERE id = ?`, [rank, result.id]);
}

function markAsWinner(db, winner) {
  winner.is_winner = 1;
  if (db) db.run(`UPDATE counterfactual_results SET is_winner = 1 WHERE id = ?`, [winner.id]);
}

async function rankResults(results, db) {
  results.sort((a, b) => b.normalized_effect - a.normalized_effect);
  for (let i = 0; i < results.length; i++) {
    await updateRank(db, results[i], i + 1);
  }
}

async function markWinner(results, db) {
  const winner = results.length > 0 ? results[0] : null;
  if (winner && winner.normalized_effect > 0) {
    markAsWinner(db, winner);
  }
  return winner;
}

async function evaluateWorlds(worlds, db) {
  for (const world of worlds) {
    world.status = 'evaluated';
    if (db) await db.run(`UPDATE counterfactual_worlds SET status = ? WHERE id = ?`,
      ['evaluated', world.id]);
  }
}

async function compareEffects(ctx) {
  const { db, worldRegistry, experimentRegistry } = ctx;
  const baselineWorldId = ctx.baselineWorldId;
  const evaluated = Array.from(worldRegistry.values())
    .filter(w => w.status === 'evaluated' || w.status === 'running');
  if (evaluated.length === 0) {
    return { winner: null, results: [], reason: 'no_evaluated_worlds' };
  }
  const baseline = baselineWorldId ? worldRegistry.get(baselineWorldId) : evaluated[0];
  const baseMetrics = getWorldMetrics(baseline.id, experimentRegistry);
  const results = [];
  for (const world of evaluated) {
    if (world.id === baseline.id) continue;
    const wm = getWorldMetrics(world.id, experimentRegistry);
    const delta = wm.score - baseMetrics.score;
    const ne = computeNormalizedEffect(delta, baseMetrics.score);
    const necessity = computeNecessity({
      causeAgent: world.id, effectAgent: 'collective_outcome',
      actualOutcome: wm.score, counterfactualOutcome: baseMetrics.score,
    });
    const metrics = { wmScore: wm.score, baseScore: baseMetrics.score, delta, ne, necessity };
    const res = buildResult(world, baseline, metrics);
    await persistResult(db, res);
    results.push(res);
  }
  await rankResults(results, db);
  const winner = await markWinner(results, db);
  await evaluateWorlds(evaluated, db);
  return { winner, results, baselineWorldId: baseline.id };
}

module.exports = {
  compareEffects, computeNormalizedEffect, getWorldMetrics,
};
