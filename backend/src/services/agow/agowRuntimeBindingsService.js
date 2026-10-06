'use strict';

const databases = new WeakMap();

function handlers(input, key) {
  const entries = input[key] || {};
  if (Object.values(entries).some((handler) => typeof handler !== 'function')) throw new TypeError(`Invalid AGOW ${key}.`);
  return { ...entries };
}

function register(input) {
  if (!input?.agentId || !input.db) throw new TypeError('AGOW runtime bindings require an agent and database.');
  if (input.counterfactualExecutor != null && typeof input.counterfactualExecutor !== 'function') {
    throw new TypeError('AGOW counterfactual executor must be callable.');
  }
  const bindings = { ...input, modeExecutors: handlers(input, 'modeExecutors'), queryHandlers: handlers(input, 'queryHandlers') };
  let agents = databases.get(input.db);
  if (!agents) { agents = new Map(); databases.set(input.db, agents); }
  agents.set(input.agentId, bindings);
  return () => { if (agents.get(input.agentId) === bindings) agents.delete(input.agentId); };
}

function resolve(input) {
  const bindings = databases.get(input.db)?.get(input.agentId) || {};
  return { ...bindings, ...input,
    modeExecutors: { ...bindings.modeExecutors, ...input.modeExecutors },
    queryHandlers: { ...bindings.queryHandlers, ...input.queryHandlers } };
}

module.exports = { register, resolve };
