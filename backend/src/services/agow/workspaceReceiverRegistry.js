'use strict';

const receivers = new Map();

function register(options) {
  if (!options?.module || typeof options.handle !== 'function') throw new TypeError('AGOW receiver requires a module and handler.');
  receivers.set(options.module, options.handle);
  return () => receivers.delete(options.module);
}

function list(options) {
  const requested = Array.isArray(options?.modules) ? options.modules : [...receivers.keys()];
  return requested.filter((module) => receivers.has(module)).map((module) => ({ module, handler: receivers.get(module) }));
}

function clear() {
  receivers.clear();
}

module.exports = { register, list, clear };
