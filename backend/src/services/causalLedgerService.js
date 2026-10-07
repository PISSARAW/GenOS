'use strict';

/**
 * Ledger causal universel (IDs causaux perception→décision→action→résultat).
 *
 * Chaque entrée porte {id, agentId, kind, causeIds[], summary, at} en
 * adaptive_state scope 'causal_ledger' (200 arêtes/agent, FIFO). trace()
 * remonte les causes jusqu'à profondeur bornée, déduplique les cycles.
 * link() lève sur entrée invalide ou stockage indisponible : les appelants
 * hot-path enveloppent en best-effort. Premier écrivain automatique :
 * orchestrationActionExecutor (événement décision → issue d'action).
 */

const { AdaptiveStateService } = require('./adaptiveStateService');

const SCOPE = 'causal_ledger';
const EDGE_LIMIT = 200;
const DEFAULT_DEPTH = 5;

async function openDb(handle) {
  if (handle && typeof handle.get === 'function') return { db: handle, close: null };
  const { getDatabase } = require('./db');
  const db = await getDatabase();
  return { db, close: () => require('./db').closeDatabase().catch(() => {}) };
}

function validEntry(entry) {
  return entry && typeof entry === 'object'
    && typeof entry.agentId === 'string' && !!entry.agentId
    && typeof entry.kind === 'string' && !!entry.kind;
}

function normalizeCauses(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((id) => typeof id === 'string' && !!id).slice(0, 8);
}

async function link(db, entry) {
  if (!validEntry(entry)) throw new Error('link requires a valid entry');
  let opened = null;
  try {
    opened = await openDb(db);
    const record = {
      id: `cause_${Date.now()}_${Math.floor(Math.random() * 0xffff).toString(16)}`,
      agentId: entry.agentId,
      kind: String(entry.kind).slice(0, 64),
      causeIds: normalizeCauses(entry.causeIds),
      summary: typeof entry.summary === 'string' ? entry.summary.slice(0, 200) : null,
      at: new Date().toISOString()
    };
    const store = new AdaptiveStateService(opened.db);
    const stored = (await store.restoreObject(SCOPE, entry.agentId)) || {};
    const edges = Array.isArray(stored.edges) ? stored.edges : [];
    await store.persistObject(SCOPE, entry.agentId, { edges: [...edges, record].slice(-EDGE_LIMIT) }, edges.length + 1);
    return record;
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

async function trace(db, agentId, query) {
  const options = query || {};
  const depth = Math.max(1, Math.min(10, Math.floor(Number(options.depth) || DEFAULT_DEPTH)));
  if (!agentId || typeof options.id !== 'string') return [];
  let opened = null;
  try {
    opened = await openDb(db);
    const store = new AdaptiveStateService(opened.db);
    const stored = (await store.restoreObject(SCOPE, agentId)) || {};
    const edges = Array.isArray(stored.edges) ? stored.edges : [];
    const byId = new Map(edges.map((edge) => [edge.id, edge]));
    const chain = walkCausalChain(byId, options, depth);
    return chain;
  } catch (_) {
    return [];
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

module.exports = { link, trace, SCOPE };

function walkCausalChain(byId, options, depth) {
const chain = [];
    const seen = new Set();
    let frontier = [options.id];
    for (let level = 0; level < depth && frontier.length; level++) {
      const next = [];
      for (const id of frontier) {
        if (seen.has(id)) continue;
        seen.add(id);
        const edge = byId.get(id);
        if (!edge) continue;
        chain.push({ ...edge, depth: level });
        for (const cause of edge.causeIds || []) next.push(cause);
      }
      frontier = next;
    }
return chain;
}
