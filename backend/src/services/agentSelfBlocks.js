'use strict';

/**
 * Blocs réflexifs unifiés (point #1).
 *
 * Charge les projections AgentSelf / WorkerSelf et le bloc de régulation
 * cognitive avec la même forme pour les deux runtimes (Codex supervisé et
 * local). Chaque fonction est best-effort : toute défaillance rend ''.
 * Au plus 3 paramètres par fonction.
 */

async function openDb(handle) {
  if (handle && typeof handle.get === 'function') return { db: handle, close: null };
  const { getDatabase } = require('./db');
  const db = await getDatabase();
  return { db, close: () => require('./db').closeDatabase().catch(() => {}) };
}

async function buildAgentBlock(db, agentId, context) {
  const { buildAgentSelf, formatAgentSelfPrompt } = require('./agentSelfService');
  const self = await buildAgentSelf(db, agentId, { context: context || {} });
  return formatAgentSelfPrompt(self);
}

async function buildWorkerBlock(db, agentId, context) {
  const { buildWorkerSelf, formatWorkerSelfPrompt } = require('./workerSelfService');
  const options = context || {};
  const ws = await buildWorkerSelf(db, {
    agentId,
    workerRole: options.workerRole || 'worker',
    workerContext: options.workerContext || {}
  });
  return formatWorkerSelfPrompt(ws);
}

async function loadAgentSelfBlock(db, agentId, context) {
  if (!agentId) return '';
  let opened = null;
  try {
    opened = await openDb(db);
    return await buildAgentBlock(opened.db, agentId, context);
  } catch (_) {
    return '';
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

async function loadWorkerSelfBlock(db, agentId, context) {
  const options = context || {};
  if (options.wantWorker === false || !agentId) return '';
  let opened = null;
  try {
    opened = await openDb(db);
    return await buildWorkerBlock(opened.db, agentId, options);
  } catch (_) {
    return '';
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

async function loadUnifiedSelfBlocks(db, agentId, context) {
  if (!agentId) return { agentSelfBlock: '', workerSelfBlock: '' };
  let opened = null;
  try {
    opened = await openDb(db);
    const options = context || {};
    const agentSelfBlock = await buildAgentBlock(opened.db, agentId, options.agentContext);
    const workerSelfBlock = options.wantWorker === false
      ? ''
      : await buildWorkerBlock(opened.db, agentId, options);
    const trace = await safeTraceBlock(opened.db, agentId);
    return { agentSelfBlock: agentSelfBlock + trace, workerSelfBlock };
  } catch (_) {
    return { agentSelfBlock: '', workerSelfBlock: '' };
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

async function safeTraceBlock(db, agentId) {
  try {
    const block = await require('./reverberationService').loadTraceBlock(db, agentId);
    return block ? `\n\n${block}` : '';
  } catch (_) {
    return '';
  }
}

async function loadConscienceText(db, agentId, agentConscience) {
  let opened = null;
  try {
    const conscience = agentConscience || require('./agentConscienceService');
    opened = await openDb(db);
    const state = opened.db && agentId
      ? await conscience.loadConscienceState(opened.db, agentId)
      : conscience.createConscienceState();
    return conscience.formatConsciencePrompt(state);
  } catch (_) {
    try {
      const fallback = agentConscience || require('./agentConscienceService');
      return fallback.formatConsciencePrompt(fallback.createConscienceState());
    } catch (_) {
      return '';
    }
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

module.exports = {
  loadAgentSelfBlock,
  loadWorkerSelfBlock,
  loadUnifiedSelfBlocks,
  loadConscienceText,
  loadTraceBlock: safeTraceBlock
};
