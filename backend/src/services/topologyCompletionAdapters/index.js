'use strict';

const { KNOWN_TOPOLOGIES, createRegistry } = require('./registry');

const defaultRegistry = createRegistry();

module.exports = { KNOWN_TOPOLOGIES, createRegistry,
  build: defaultRegistry.build, register: defaultRegistry.register,
  resolve: defaultRegistry.resolve };
