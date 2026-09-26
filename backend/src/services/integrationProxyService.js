'use strict';

/**
 * Proxy d'intégration sur micro-circuits (IIT, indicateur seulement).
 *
 * CE N'EST PAS Phi et ne prouve rien : deux heuristiques bornées sur un
 * micro-circuit de ≤ 8 agents (lignée : soi + parent + enfants) binarisé
 * depuis telemetry_events sur une fenêtre glissante :
 * - différenciation : répertoire d'états conjoints distincts / min(2^N, bins),
 *   + entropie normalisée de leur distribution ;
 * - intégration : NMI minimale entre chaque noeud et l'agrégat (OU) du
 *   reste — maillon faible façon IIT (un noeud déconnecté ⇒ 0).
 * measure() ne lève jamais : 'insufficient_data' ou 'unavailable' sinon.
 */

const MAX_NODES = 8;
const DEFAULT_WINDOW_MS = 30 * 60 * 1000;
const DEFAULT_BINS = 64;
const MIN_ACTIVE_BINS = 8;
const LIMITATION = 'Proxy heuristique : ni Phi ni preuve de conscience.';

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function sqliteUtc(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function parseSqliteUtc(value) {
  const ms = Date.parse(`${String(value || '').replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? ms : NaN;
}

async function lineageCircuit(db, agentId, max) {
  const circuit = [agentId];
  try {
    const parent = await db.get('SELECT parent_agent_id FROM agents WHERE id = ?', agentId);
    if (parent?.parent_agent_id && !circuit.includes(parent.parent_agent_id)) circuit.push(parent.parent_agent_id);
    const children = await db.all('SELECT id FROM agents WHERE parent_agent_id = ? LIMIT ?', agentId, max);
    for (const child of children || []) {
      if (circuit.length >= max) break;
      if (child?.id && !circuit.includes(child.id)) circuit.push(child.id);
    }
  } catch (_) {}
  return circuit.slice(0, max);
}

function binMatrix(rows, agents, spec) {
  const matrix = agents.map(() => new Array(spec.bins).fill(0));
  const index = new Map(agents.map((id, position) => [id, position]));
  for (const row of rows || []) {
    const position = index.get(row.agent_id);
    if (position === undefined) continue;
    const at = parseSqliteUtc(row.created_at);
    if (!Number.isFinite(at)) continue;
    const bin = Math.floor((at - spec.startMs) / spec.binMs);
    if (bin >= 0 && bin < spec.bins) matrix[position][bin] = 1;
  }
  return matrix;
}

function differentiationOf(matrix) {
  const bins = matrix[0]?.length || 0;
  if (!matrix.length || !bins) return { repertoire: 0, entropy: 0 };
  const counts = new Map();
  for (let b = 0; b < bins; b++) {
    const key = matrix.map((row) => row[b]).join('');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const ceiling = Math.min(2 ** matrix.length, bins);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / bins;
    entropy -= probability * Math.log2(probability);
  }
  return {
    repertoire: ceiling > 0 ? counts.size / ceiling : 0,
    entropy: counts.size > 1 ? entropy / Math.log2(counts.size) : 0
  };
}

function binaryStats(a, b) {
  const joint = [0, 0, 0, 0];
  for (let i = 0; i < a.length; i++) joint[(a[i] ? 2 : 0) + (b[i] ? 1 : 0)] += 1;
  return joint.map((count) => count / a.length);
}

function shannonBinary(probability) {
  if (probability <= 0 || probability >= 1) return 0;
  return -probability * Math.log2(probability) - (1 - probability) * Math.log2(1 - probability);
}

function normalizedMI(a, b) {
  if (!a.length || a.length !== b.length) return 0;
  const [p00, p01, p10, p11] = binaryStats(a, b);
  const entropyOf = (p) => (p > 0 ? -p * Math.log2(p) : 0);
  const joint = entropyOf(p00) + entropyOf(p01) + entropyOf(p10) + entropyOf(p11);
  const entropyA = shannonBinary(p10 + p11);
  const entropyB = shannonBinary(p01 + p11);
  const mi = entropyA + entropyB - joint;
  const denom = Math.min(entropyA, entropyB);
  return denom > 0 ? Math.max(0, Math.min(1, mi / denom)) : 0;
}

function orAggregate(matrix, skip) {
  const bins = matrix[0]?.length || 0;
  const aggregate = new Array(bins).fill(0);
  matrix.forEach((row, position) => {
    if (position === skip) return;
    for (let b = 0; b < bins; b++) aggregate[b] = aggregate[b] || row[b];
  });
  return aggregate;
}

function isConstantRow(row) {
  return row.every((bit) => bit === row[0]);
}

function minCutIntegration(matrix) {
  let integration = 1;
  let weakest = 0;
  matrix.forEach((row, position) => {
    const score = normalizedMI(row, orAggregate(matrix, position));
    if (score < integration || (score === integration && isConstantRow(row))) {
      integration = score;
      weakest = position;
    }
  });
  return { integration, weakest };
}

function activeNodes(matrix) {
  return matrix.filter((row) => row.some((bit) => bit === 1)).length;
}

function activeBins(matrix) {
  const bins = matrix[0]?.length || 0;
  let count = 0;
  for (let b = 0; b < bins; b++) {
    if (matrix.some((row) => row[b] === 1)) count += 1;
  }
  return count;
}

async function measure(db, agentId, options) {
  const settings = options || {};
  try {
    if (!db || !agentId) return { status: 'insufficient_data', reason: 'missing agent' };
    const windowMs = finiteOr(settings.windowMs, DEFAULT_WINDOW_MS);
    const bins = Math.max(8, Math.min(256, Math.floor(Number(settings.bins) || DEFAULT_BINS)));
    const agents = await lineageCircuit(db, agentId, MAX_NODES);
    const now = Number(settings.now || Date.now());
    const spec = { bins, startMs: now - windowMs, binMs: windowMs / bins };
    const placeholders = agents.map(() => '?').join(',');
    const rows = await db.all(
      `SELECT agent_id, created_at FROM telemetry_events WHERE agent_id IN (${placeholders}) AND created_at >= ?`,
      ...agents, sqliteUtc(spec.startMs)
    );
    const matrix = binMatrix(rows, agents, spec);
    if (activeNodes(matrix) < 2 || activeBins(matrix) < MIN_ACTIVE_BINS) {
      return { status: 'insufficient_data', reason: 'circuit too quiet', nodes: agents.length };
    }
    const differentiation = differentiationOf(matrix);
    const cut = minCutIntegration(matrix);
    const round3 = (value) => Math.round(value * 1000) / 1000;
    return {
      status: 'measured',
      agentId,
      nodes: agents,
      bins,
      windowMs,
      differentiation: round3(differentiation.repertoire),
      stateEntropy: round3(differentiation.entropy),
      integration: round3(cut.integration),
      weakestNode: agents[cut.weakest] || null,
      limitation: LIMITATION
    };
  } catch (_) {
    return { status: 'unavailable' };
  }
}

module.exports = { measure, normalizedMI, differentiationOf, minCutIntegration, LIMITATION };
