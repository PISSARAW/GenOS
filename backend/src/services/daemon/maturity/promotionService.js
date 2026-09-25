'use strict';

/**
 * Maturity Promotion — ADR 0034 D20 v1.
 *
 * La promotion experimental → stable n'est accordée que sur preuves :
 *  - ≥ MIN_RUNS comparaisons warm-start avec gain moyen de rappel ;
 *  - couverture d'ablation : FULL domine chaque bras ablaté ;
 *  - taux de faux findings (REFUTED / clos) sous plafond ;
 *  - zéro erreur de staleness (connaissance jamais portée en silence
 *    sur un HEAD avancé) ;
 *  - suites daemon vertes (signal CI injecté, jamais auto-déclaré).
 * Sinon le reçu verdict=EXPERIMENTAL liste les bloqueurs. Le reçu est
 * persisté dans daemon_promotions dans tous les cas (traçabilité).
 */

const { migrateDaemonEvaluation } = require('../../../db/migrations/migrateDaemonEvaluation');
const { migrateDaemonFindings } = require('../../../db/migrations/migrateDaemonFindings');
const { migrateDaemonTerritory } = require('../../../db/migrations/migrateDaemonTerritory');

const MIN_RUNS = 3;
const MIN_MEAN_RECALL_GAIN = 1;
const MAX_FALSE_FINDING_RATE = 0.5;
const MIN_LIVE_PROTOCOLS = 3;
const MIN_LIVE_BETTER_RATE = 2 / 3;

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function warmStats(runs) {
  const colds = runs.filter((r) => r.arm === 'cold').map((r) => JSON.parse(r.metrics_json || '{}'));
  const warms = runs.filter((r) => r.arm === 'warm').map((r) => JSON.parse(r.metrics_json || '{}'));
  const pairs = Math.min(colds.length, warms.length);
  const gains = [];
  for (let i = 0; i < pairs; i += 1) {
    gains.push((warms[i].recalledFindings || 0) - (colds[i].recalledFindings || 0));
  }
  return { pairs, meanGain: mean(gains) };
}

function ablationDominated(runs) {
  const full = runs.find((r) => r.arm === 'FULL');
  const arms = runs.filter((r) => r.arm !== 'FULL');
  if (!full || arms.length === 0) return false;
  const fullMetrics = JSON.parse(full.metrics_json || '{}');
  return arms.every((r) => dominates(fullMetrics, JSON.parse(r.metrics_json || '{}')));
}

function dominates(fullMetrics, armMetrics) {
  if ((armMetrics.recalledFindings || 0) > (fullMetrics.recalledFindings || 0)) return false;
  return (armMetrics.recalledDeadEnds || 0) <= (fullMetrics.recalledDeadEnds || 0);
}

function parseMetrics(row) {
  try {
    return JSON.parse(row.metrics_json || '{}');
  } catch (_) {
    return {};
  }
}

function liveStats(runs) {
  const protocols = new Map();
  runs.forEach((run) => {
    const metrics = parseMetrics(run);
    if (!metrics.protocolId || !['A', 'B', 'C'].includes(run.arm)) return;
    if (!protocols.has(metrics.protocolId)) protocols.set(metrics.protocolId, {});
    protocols.get(metrics.protocolId)[run.arm] = metrics;
  });
  const complete = [...protocols.values()].filter((arms) => arms.A && arms.B && arms.C);
  const better = complete.filter(warmProtocolWins).length;
  return { complete: complete.length, better, betterRate: complete.length ? better / complete.length : 0 };
}

function warmProtocolWins(arms) {
  const cold = arms.A;
  const digest = arms.B;
  const warm = arms.C;
  if (!warm.taskSuccess) return false;
  return improvesBaseline(warm, cold) && improvesBaseline(warm, digest);
}

function improvesBaseline(warm, baseline) {
  if (!baseline.taskSuccess) return true;
  const rankGain = successRank(warm) - successRank(baseline);
  return rankGain > 0 || (rankGain === 0 && warm.tokensUsed < baseline.tokensUsed);
}

function successRank(metrics) {
  return (metrics.taskSuccess ? 2 : 0) + (metrics.correctLocalization ? 1 : 0);
}

async function findingStats(db) {
  await migrateDaemonFindings(db);
  await migrateDaemonTerritory(db);
  const rows = await db.all(`SELECT status, territory_id, head_sha FROM daemon_findings`);
  const closed = rows.filter((r) => ['SUPPORTED', 'REPRODUCED', 'CAUSALLY_SUPPORTED', 'REPAIRABLE'].includes(r.status)).length;
  const refuted = rows.filter((r) => r.status === 'REFUTED').length;
  const territories = await db.all('SELECT id, head_sha FROM daemon_territories');
  const heads = {};
  territories.forEach((t) => { heads[t.id] = t.head_sha; });
  const staleErrors = rows.filter((r) => {
    if (['REFUTED', 'EXPIRED', 'STALE'].includes(r.status)) return false;
    return heads[r.territory_id] && r.head_sha !== heads[r.territory_id];
  }).length;
  return { total: rows.length, closed, refuted, staleErrors };
}

async function evaluateMaturity(db, args) {
  if (!db) return { maturity: 'EXPERIMENTAL', reasons: ['no-database'] };
  await migrateDaemonEvaluation(db);
  const warmRuns = await db.all("SELECT * FROM daemon_eval_runs WHERE kind = 'warm-start' ORDER BY created_at DESC");
  const ablationRuns = await db.all("SELECT * FROM daemon_eval_runs WHERE kind = 'ablation' ORDER BY created_at DESC");
  const liveRuns = await db.all("SELECT * FROM daemon_eval_runs WHERE kind = 'live-protocol' ORDER BY created_at DESC");
  const stats = await findingStats(db);
  return decidePromotion(db, { args: args || {}, warmRuns, ablationRuns, liveRuns, stats });
}

async function decidePromotion(db, job) {
  const { args, warmRuns, ablationRuns, stats } = job;
  const warm = warmStats(warmRuns);
  const live = liveStats(job.liveRuns || []);
  const reasons = collectBlockers({ args, warm, ablationRuns, live, stats });
  const maturity = reasons.length === 0 ? 'STABLE' : 'EXPERIMENTAL';
  const evidence = {
    warmPairs: warm.pairs,
    meanRecallGain: warm.meanGain,
    ablationArms: ablationRuns.length,
    liveProtocols: live.complete,
    liveBetterProtocols: live.better,
    liveBetterRate: live.betterRate,
    falseFindingRate: falseRate(stats),
    staleErrors: stats.staleErrors,
    suitesGreen: args.suitesGreen === true
  };
  await db.run(
    'INSERT INTO daemon_promotions (from_maturity, to_maturity, verdict, evidence_json) VALUES (?, ?, ?, ?)',
    'EXPERIMENTAL',
    maturity,
    maturity === 'STABLE' ? 'promoted' : reasons.join('; '),
    JSON.stringify(evidence)
  );
  return { maturity, reasons, evidence };
}

function collectBlockers(job) {
  const reasons = [];
  if (job.warm.pairs < MIN_RUNS) reasons.push(`only ${job.warm.pairs} warm-start pairs, need ${MIN_RUNS}`);
  if (job.warm.meanGain < MIN_MEAN_RECALL_GAIN) reasons.push(`mean recall gain ${job.warm.meanGain}, need ${MIN_MEAN_RECALL_GAIN}`);
  if (!ablationDominated(job.ablationRuns)) reasons.push('ablation coverage missing or FULL not dominating');
  if (job.live.complete < MIN_LIVE_PROTOCOLS) reasons.push(`only ${job.live.complete} complete live protocols, need ${MIN_LIVE_PROTOCOLS}`);
  if (job.live.betterRate < MIN_LIVE_BETTER_RATE) reasons.push(`live warm benefit rate ${job.live.betterRate}, need ${MIN_LIVE_BETTER_RATE}`);
  if (falseRate(job.stats) > MAX_FALSE_FINDING_RATE) reasons.push(`false-finding rate ${falseRate(job.stats)}, max ${MAX_FALSE_FINDING_RATE}`);
  if (job.stats.staleErrors > 0) reasons.push(`${job.stats.staleErrors} staleness errors`);
  if (job.args.suitesGreen !== true) reasons.push('daemon suites not green');
  return reasons;
}

function falseRate(stats) {
  if (stats.closed + stats.refuted === 0) return 0;
  return stats.refuted / (stats.closed + stats.refuted);
}

async function listPromotions(db) {
  if (!db) return [];
  await migrateDaemonEvaluation(db);
  return db.all('SELECT * FROM daemon_promotions ORDER BY decided_at DESC');
}

module.exports = {
  evaluateMaturity,
  listPromotions,
  MIN_RUNS,
  MIN_MEAN_RECALL_GAIN,
  MAX_FALSE_FINDING_RATE,
  MIN_LIVE_PROTOCOLS,
  MIN_LIVE_BETTER_RATE
};
