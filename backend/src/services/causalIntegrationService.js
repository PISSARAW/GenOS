'use strict';

/**
 * Moteur d'intégration causale (ablation simulée + PID-lite, heuristique).
 *
 * L'intégration n'est plus un score de conscience mais un outil
 * d'architecture pour Morphogenèse : sur le micro-circuit de lignée,
 * - ablations simulées (retrait d'un noeud, recalcul) : chute
 *   d'intégration/différenciation par noeud ;
 * - PID-lite vs issue Y (succès par bin) : redondance = min des NMI,
 *   synergie = max(0, NMI(ET(i,j);Y) − max(NMI(i;Y),NMI(j;Y))) ;
 * - recommandations : prune_candidate, preserve_link, merge_candidate,
 *   protect_channel.
 * Ablation de canaux (A→B sans A) exige un graphe causal, non implémentée
 * (documenté). Ne lève jamais : statuts insufficient_data/unavailable.
 */

const proxy = require('./integrationProxyService');

const MAX_NODES = 8;
const WINDOW_MS = 30 * 60 * 1000;
const BINS = 64;
const MIN_ACTIVE_BINS = 8;
const LIMITATION = 'Ablation simulée sur données enregistrées + PID heuristique : ni causalité prouvée ni Phi.';

function sqliteUtc(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function parseSqliteUtc(value) {
  const ms = Date.parse(`${String(value || '').replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? ms : NaN;
}

function andAggregate(a, b) {
  return a.map((bit, index) => (bit && b[index] ? 1 : 0));
}

function pidOf(nmiA, nmiB, nmiJoint) {
  const redundancy = Math.min(nmiA, nmiB);
  return {
    redundancy,
    uniqueA: Math.max(0, nmiA - redundancy),
    uniqueB: Math.max(0, nmiB - redundancy),
    synergy: Math.max(0, nmiJoint - Math.max(nmiA, nmiB))
  };
}

function recommendPair(pid, coupling) {
  if (pid.synergy >= 0.3) return 'preserve_link';
  if (pid.redundancy >= 0.5 && pid.uniqueA < 0.1 && pid.uniqueB < 0.1) return 'merge_candidate';
  if (coupling < 0.1) return 'independent_parallelize';
  return 'observe';
}

async function analyzeCircuit(db, agentId, options) {
  const settings = options || {};
  try {
    if (!db || !agentId) return { status: 'insufficient_data', reason: 'missing agent' };
    const agents = await proxy.lineageCircuit(db, agentId, MAX_NODES);
    const now = Number(settings.now || Date.now());
    const spec = { bins: BINS, startMs: now - WINDOW_MS, binMs: WINDOW_MS / BINS };
    const placeholders = agents.map(() => '?').join(',');
    const rows = await db.all(
      `SELECT agent_id, event_type AS eventType, created_at FROM telemetry_events WHERE agent_id IN (${placeholders}) AND created_at >= ?`,
      ...agents, sqliteUtc(spec.startMs)
    );
    const matrix = proxy.binMatrix(rows, agents, spec);
    const active = matrix.filter((row) => row.some((bit) => bit === 1)).length;
    if (active < 2) return { status: 'insufficient_data', reason: 'circuit too quiet', nodes: agents.length };
    const outcome = matrix[0].map((_, bin) => (rows.some((row) => row.eventType === 'AGENT_COMPLETED' && binOf(row.created_at, spec) === bin) ? 1 : 0));
    const base = proxy.minCutIntegration(matrix);
    const baseDiff = proxy.differentiationOf(matrix);
    const nodeAblations = matrix.map((row, position) => {
      const masked = matrix.filter((_, other) => other !== position);
      const cut = masked.length ? proxy.minCutIntegration(masked) : { integration: 0 };
      const diff = masked.length ? proxy.differentiationOf(masked) : { repertoire: 0, entropy: 0 };
      return {
        node: agents[position],
        dIntegration: cut.integration - base.integration,
        dDifferentiation: diff.repertoire - baseDiff.repertoire,
        recommendation: cut.integration - base.integration <= -0.3 ? 'protect_channel' : baseDiff.repertoire - diff.repertoire <= 0 && proxy.normalizedMI(row, outcome) < 0.1 ? 'prune_candidate' : 'observe'
      };
    });
    const pairwise = [];
    const hasOutcome = outcome.some((bit) => bit === 1);
    for (let i = 0; i < matrix.length; i++) {
      for (let j = i + 1; j < matrix.length; j++) {
        const nmiA = hasOutcome ? proxy.normalizedMI(matrix[i], outcome) : 0;
        const nmiB = hasOutcome ? proxy.normalizedMI(matrix[j], outcome) : 0;
        const joint = hasOutcome ? proxy.normalizedMI(andAggregate(matrix[i], matrix[j]), outcome) : 0;
        const pid = pidOf(nmiA, nmiB, joint);
        const coupling = proxy.normalizedMI(matrix[i], matrix[j]);
        pairwise.push({ a: agents[i], b: agents[j], coupling, ...pid, recommendation: recommendPair(pid, coupling) });
      }
    }
    return {
      status: 'measured',
      agentId,
      nodes: agents,
      nodeAblations,
      pairwise,
      outcomeSignal: hasOutcome,
      limitation: LIMITATION
    };
  } catch (_) {
    return { status: 'unavailable' };
  }
}

function binOf(createdAt, spec) {
  const at = parseSqliteUtc(createdAt);
  if (!Number.isFinite(at)) return -1;
  return Math.floor((at - spec.startMs) / spec.binMs);
}

module.exports = { analyzeCircuit };
