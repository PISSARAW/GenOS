'use strict';

/**
 * Live Protocol Runner — ADR 0034 D21 (Phase 32-34, harnais honnête).
 *
 * Question décisive : un orchestrateur warm résout-il mieux et moins
 * cher qu'à froid, à modèle/tâche/repo/HEAD/budget identiques ?
 * Bras : A (LLM seul) vs B (LLM + GenOS sans daemon) vs C (LLM +
 * GenOS warm). L'exécuteur live est INJECTÉ (il possède le modèle,
 * le budget et la tâche) ; ce runner orchestre, persiste les reçus
 * (`kind='live-protocol'`) et calcule le verdict.
 *
 * Anti-fraude : sans exécuteur → `ran:false`, ZÉRO ligne écrite.
 * Aucun succès simulé ne peut débloquer STABLE. Les métriques sont
 * celles rapportées par l'exécuteur, jamais inventées ici. Les reçus
 * sont par bras (arm A/B/C + HEAD) : un protocole interrompu laisse
 * les bras exécutés, sans verdict — le verdict n'existe que pour un
 * triple complet.
 */

const crypto = require('node:crypto');
const { migrateDaemonEvaluation } = require('../../../db/migrations/migrateDaemonEvaluation');
const territoryService = require('../daemonTerritoryService');

const LIVE_ARMS = ['A', 'B', 'C'];

function liveRunId(arm) {
  return `eval-live-${arm}-${crypto.randomBytes(4).toString('hex')}`;
}

function num(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

async function headOf(db, territoryId) {
  try {
    const stored = await territoryService.getTerritory(db, { id: territoryId });
    if (stored.found) return stored.territory.headSha;
  } catch (_) {
    /* head inconnu : le bras sera refusé, pas deviné */
  }
  return null;
}

async function runLiveArm(db, job) {
  const headSha = job.headSha || await headOf(db, job.territoryId);
  if (!headSha) return { arm: job.arm, ran: false, reason: 'unknown-head' };
  const reported = await job.executor({ arm: job.arm, territoryId: job.territoryId, mission: job.mission });
  const metrics = toLiveMetrics(reported, job.protocolId);
  const id = liveRunId(job.arm);
  await db.run(
    `INSERT INTO daemon_eval_runs (id, kind, arm, territory_id, head_sha, metrics_json)
     VALUES (?, 'live-protocol', ?, ?, ?, ?)`,
    id,
    job.arm,
    job.territoryId,
    headSha,
    JSON.stringify(metrics)
  );
  return { arm: job.arm, ran: true, runId: id, metrics };
}

function toLiveMetrics(reported, protocolId) {
  const source = reported || {};
  return {
    protocolId,
    taskSuccess: source.taskSuccess === true,
    correctLocalization: source.correctLocalization === true,
    tokensUsed: num(source.tokensUsed),
    toolCallsUsed: num(source.toolCallsUsed),
    filesOpened: num(source.filesOpened),
    durationMs: num(source.durationMs)
  };
}

async function runLiveProtocol(db, args) {
  if (!db || !args || !args.coldTerritoryId || !args.warmTerritoryId) {
    return { ran: false, reason: 'args-required' };
  }
  if (typeof args.executor !== 'function') {
    return { ran: false, reason: 'no-live-executor', note: 'STABLE requires executed live runs, never simulated success' };
  }
  await migrateDaemonEvaluation(db);
  const arms = await runAllArms(db, args);
  if (arms.some((a) => !a.ran)) return { ran: false, reason: 'arm-failed', arms };
  return { ran: true, mission: args.mission || null, arms, verdict: liveVerdict(arms) };
}

async function runAllArms(db, args) {
  const protocolId = liveRunId('protocol');
  const out = [];
  out.push(await runLiveArm(db, { arm: 'A', territoryId: args.coldTerritoryId, mission: args.mission, executor: args.executor, protocolId }));
  out.push(await runLiveArm(db, { arm: 'B', territoryId: args.coldTerritoryId, mission: args.mission, executor: args.executor, protocolId }));
  out.push(await runLiveArm(db, { arm: 'C', territoryId: args.warmTerritoryId, mission: args.mission, executor: args.executor, protocolId }));
  return out;
}

function liveVerdict(arms) {
  const byArm = {};
  arms.forEach((a) => { byArm[a.arm] = a.metrics; });
  const warm = byArm.C;
  const digest = byArm.B;
  return {
    warmSolved: warm.taskSuccess === true,
    digestSolved: digest.taskSuccess === true,
    coldSolved: byArm.A.taskSuccess === true,
    warmBetterOrEqual: successRank(warm) >= successRank(byArm.A),
    warmBetterThanDigest: improvesDigest(warm, digest),
    tokenDeltaWarmVsCold: (byArm.A.tokensUsed || 0) - (warm.tokensUsed || 0),
    tokenDeltaWarmVsDigest: (digest.tokensUsed || 0) - (warm.tokensUsed || 0)
  };
}

function improvesDigest(warm, digest) {
  const rankGain = successRank(warm) - successRank(digest);
  return rankGain > 0 || (rankGain === 0 && warm.tokensUsed < digest.tokensUsed);
}

function successRank(metrics) {
  if (!metrics) return -1;
  return (metrics.taskSuccess ? 2 : 0) + (metrics.correctLocalization ? 1 : 0);
}

async function liveEvidence(db, query) {
  await migrateDaemonEvaluation(db);
  const rows = await db.all(
    "SELECT * FROM daemon_eval_runs WHERE kind = 'live-protocol' ORDER BY created_at DESC"
  );
  return { runs: rows || [], executed: (rows || []).length > 0 };
}

module.exports = {
  LIVE_ARMS,
  runLiveProtocol,
  liveEvidence
};
