'use strict';

/**
 * Ablation Runner — ADR 0034 D18 v1 (déterministe).
 *
 * Chaque mécanisme biomimétique doit prouver sa valeur : le même
 * TerritoryBrief FULL est dégradé bras par bras (vues filtrées, sans
 * re-compilation dupliquée) et les métriques sont comparées.
 * Bras ADR : FULL, no-stigmergy, no-negative-memory, polling,
 * no-territorial-history, raw-digest.
 *  - no-stigmergy : attention vidée (l'orchestrateur perd le "regarde là")
 *  - no-negative-memory : dead-ends oubliés (risque de retenter l'échec)
 *  - polling : avertissements de staleness masqués (aveugle au HEAD bougé)
 *  - no-territorial-history : dead-ends + attention vidés (amnésie)
 *  - raw-digest : findings vidés (simple inventaire fichiers/tests)
 * Chaque bras est persisté (kind='ablation') pour la promotion (D20).
 */

const crypto = require('node:crypto');
const { migrateDaemonEvaluation } = require('../../../db/migrations/migrateDaemonEvaluation');
const compiler = require('../handoff/handoffCompilerService');
const warmStart = require('./warmStartBenchmark');

const ARMS = ['FULL', 'no-stigmergy', 'no-negative-memory', 'polling', 'no-territorial-history', 'raw-digest'];

function ablateView(brief, arm) {
  const view = JSON.parse(JSON.stringify(brief));
  if (arm === 'no-stigmergy' || arm === 'no-territorial-history') view.attention = [];
  if (arm === 'no-negative-memory' || arm === 'no-territorial-history') view.deadEnds = [];
  if (arm === 'polling') view.stalenessWarnings = [];
  if (arm === 'raw-digest') {
    view.findings = [];
    view.deadEnds = [];
    view.attention = [];
  }
  return view;
}

async function persistArm(db, job) {
  const id = `eval-ablation-${job.arm}-${crypto.randomBytes(4).toString('hex')}`;
  await db.run(
    `INSERT INTO daemon_eval_runs (id, kind, arm, territory_id, head_sha, metrics_json)
     VALUES (?, 'ablation', ?, ?, ?, ?)`,
    id,
    job.arm,
    job.territoryId,
    job.headSha,
    JSON.stringify(job.metrics)
  );
  return id;
}

async function runAblations(db, args) {
  if (!db || !args || !args.territoryId) return { ablated: false, reason: 'args-required' };
  await migrateDaemonEvaluation(db);
  const compiled = await compiler.compileBrief(db, { territoryId: args.territoryId, mission: args.mission });
  if (!compiled.compiled) return { ablated: false, reason: compiled.reason };
  const table = [];
  for (const arm of ARMS) {
    table.push(await measureArm(db, { brief: compiled.brief, arm, territoryId: args.territoryId }));
  }
  const full = table.find((row) => row.arm === 'FULL');
  return { ablated: true, territoryId: args.territoryId, full, table: withDeltas(table, full) };
}

async function measureArm(db, job) {
  const view = ablateView(job.brief, job.arm);
  const metrics = warmStart.briefMetrics(view);
  const runId = await persistArm(db, { arm: job.arm, territoryId: job.territoryId, headSha: job.brief.headSha, metrics });
  return { arm: job.arm, runId, metrics };
}

function withDeltas(table, full) {
  return table.map((row) => ({
    arm: row.arm,
    runId: row.runId,
    metrics: row.metrics,
    recallDelta: row.metrics.recalledFindings - full.metrics.recalledFindings,
    deadEndDelta: row.metrics.recalledDeadEnds - full.metrics.recalledDeadEnds
  }));
}

module.exports = { ARMS, runAblations };
