'use strict';

/**
 * Warm-Start Benchmark — ADR 0034 D17 v1 (proxy déterministe).
 *
 * Question MVP : un orchestrateur qui arrive sur un territoire déjà
 * surveillé (warm) obtient-il un meilleur dossier qu'à froid (cold) ?
 * Le protocole complet Phase 32-34 (runs LLM live A/B/C, mêmes
 * modèle/tâche/repo/HEAD/budget) reste à exécuter hors ligne ; ce
 * harnais fournit le proxy déterministe : même mission, même HEAD,
 * bras COLD (territoire vide) vs bras WARM (territoire arpenté —
 * findings, dead-ends, attention stigmergique). Métriques : findings
 * rappelés, dead-ends rappelés, classe de pertinence, avertissements
 * de staleness, signaux d'attention. Chaque bras est persisté dans
 * daemon_eval_runs pour les ablations (D18) et la promotion (D20).
 *
 * Limite honnête : mesure la contribution de la connaissance daemon,
 * pas le succès de tâche LLM de bout en bout.
 */

const crypto = require('node:crypto');
const { migrateDaemonEvaluation } = require('../../../db/migrations/migrateDaemonEvaluation');
const compiler = require('../handoff/handoffCompilerService');

const CLASS_RANK = { low: 0, medium: 1, high: 2 };

function runId(kind, arm) {
  return `eval-${kind}-${arm}-${crypto.randomBytes(4).toString('hex')}`;
}

function briefMetrics(brief) {
  return {
    recalledFindings: (brief.findings || []).length,
    recalledDeadEnds: (brief.deadEnds || []).length,
    relevanceRank: CLASS_RANK[brief.relevanceClass] || 0,
    relevanceClass: brief.relevanceClass,
    stalenessWarnings: (brief.stalenessWarnings || []).length,
    attentionSignals: (brief.attention || []).length,
    openFindings: (brief.summary && brief.summary.openFindings) || 0
  };
}

async function runArm(db, job) {
  const compiled = await compiler.compileBrief(db, { territoryId: job.territoryId, mission: job.mission });
  if (!compiled.compiled) return { arm: job.arm, ran: false, reason: compiled.reason };
  const metrics = briefMetrics(compiled.brief);
  const id = runId('warm-start', job.arm);
  await db.run(
    `INSERT INTO daemon_eval_runs (id, kind, arm, territory_id, head_sha, metrics_json)
     VALUES (?, 'warm-start', ?, ?, ?, ?)`,
    id,
    job.arm,
    job.territoryId,
    compiled.brief.headSha,
    JSON.stringify(metrics)
  );
  return { arm: job.arm, ran: true, runId: id, metrics };
}

async function runComparison(db, args) {
  if (!db || !args || !args.coldTerritoryId || !args.warmTerritoryId) {
    return { compared: false, reason: 'args-required' };
  }
  await migrateDaemonEvaluation(db);
  const cold = await runArm(db, { territoryId: args.coldTerritoryId, mission: args.mission, arm: 'cold' });
  const warm = await runArm(db, { territoryId: args.warmTerritoryId, mission: args.mission, arm: 'warm' });
  if (!cold.ran || !warm.ran) return { compared: false, reason: 'arm-failed', cold, warm };
  const recallGain = warm.metrics.recalledFindings - cold.metrics.recalledFindings;
  const deadEndGain = warm.metrics.recalledDeadEnds - cold.metrics.recalledDeadEnds;
  return {
    compared: true,
    mission: args.mission || null,
    cold,
    warm,
    verdict: {
      recallGain,
      deadEndGain,
      warmBetterOrEqual: recallGain >= 0 && deadEndGain >= 0
    }
  };
}

async function listEvalRuns(db, query) {
  if (!db) return [];
  await migrateDaemonEvaluation(db);
  const scoped = query || {};
  if (scoped.kind) {
    return db.all('SELECT * FROM daemon_eval_runs WHERE kind = ? ORDER BY created_at DESC', scoped.kind);
  }
  return db.all('SELECT * FROM daemon_eval_runs ORDER BY created_at DESC');
}

module.exports = { runComparison, listEvalRuns, briefMetrics, CLASS_RANK };
