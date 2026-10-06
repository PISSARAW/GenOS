'use strict';

const receivers = new Map();
const queryHandlers = new Map();

function register(options) {
  if (!options?.module || typeof options.handle !== 'function') throw new TypeError('AGOW receiver requires a module and handler.');
  if (options.default === true && receivers.has(options.module)) return () => {};
  receivers.set(options.module, options.handle);
  return () => { if (receivers.get(options.module) === options.handle) receivers.delete(options.module); };
}

function list(options) {
  const requested = Array.isArray(options?.modules) ? options.modules : [...receivers.keys()];
  return requested.filter((module) => receivers.has(module)).map((module) => ({ module, handler: receivers.get(module) }));
}

function registerQuery(options) {
  if (!options?.module || typeof options.handle !== 'function') throw new TypeError('AGOW query handler requires a module and handler.');
  if (options.default === true && queryHandlers.has(options.module)) return () => {};
  const entry = { handle: options.handle, estimatedCost: options.estimatedCost ?? 1 };
  queryHandlers.set(options.module, entry);
  return () => { if (queryHandlers.get(options.module) === entry) queryHandlers.delete(options.module); };
}

function queryModules(options) {
  const requested = Array.isArray(options?.modules) ? options.modules : [...queryHandlers.keys()];
  return requested.filter((module) => queryHandlers.has(module));
}

function queryHandlersFor(options) {
  return queryModules(options).map((module) => ({ module, ...queryHandlers.get(module) }));
}

function clear() {
  receivers.clear();
  queryHandlers.clear();
}

module.exports = { register, list, registerQuery, queryModules, queryHandlersFor, clear };
