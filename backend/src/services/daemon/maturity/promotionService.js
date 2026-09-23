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
  const stats = await findingStats(db);
  return decidePromotion(db, { args: args || {}, warmRuns, ablationRuns, stats });
}

async function decidePromotion(db, job) {
  const { args, warmRuns, ablationRuns, stats } = job;
  const warm = warmStats(warmRuns);
  const reasons = collectBlockers({ args, warm, ablationRuns, stats });
  const maturity = reasons.length === 0 ? 'STABLE' : 'EXPERIMENTAL';
  const evidence = {
    warmPairs: warm.pairs,
    meanRecallGain: warm.meanGain,
    ablationArms: ablationRuns.length,
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

module.exports = { evaluateMaturity, listPromotions, MIN_RUNS, MIN_MEAN_RECALL_GAIN, MAX_FALSE_FINDING_RATE };
