'use strict';

const receivers = new Map();
const queryHandlers = new Map();

function register(options) {
  if (!options?.module || typeof options.handle !== 'function') throw new TypeError('AGOW receiver requires a module and handler.');
  receivers.set(options.module, options.handle);
  return () => receivers.delete(options.module);
}

function list(options) {
  const requested = Array.isArray(options?.modules) ? options.modules : [...receivers.keys()];
  return requested.filter((module) => receivers.has(module)).map((module) => ({ module, handler: receivers.get(module) }));
}

function registerQuery(options) {
  if (!options?.module || typeof options.handle !== 'function') throw new TypeError('AGOW query handler requires a module and handler.');
  queryHandlers.set(options.module, options.handle);
  return () => queryHandlers.delete(options.module);
}

function queryModules(options) {
  const requested = Array.isArray(options?.modules) ? options.modules : [...queryHandlers.keys()];
  return requested.filter((module) => queryHandlers.has(module));
}

function queryHandlersFor(options) {
  return queryModules(options).map((module) => ({ module, handle: queryHandlers.get(module) }));
}

function clear() {
  receivers.clear();
  queryHandlers.clear();
}

module.exports = { register, list, registerQuery, queryModules, queryHandlersFor, clear };
