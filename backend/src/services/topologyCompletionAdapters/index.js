'use strict';

const { KNOWN_TOPOLOGIES, createRegistry } = require('./registry');
const aTeamAdapter = require('./aTeamAdapter');
const biocenoseAdapter = require('./biocenoseAdapter');
const trinityAdapter = require('./trinityAdapter');

const defaultRegistry = createRegistry({
  a_team: aTeamAdapter, biocenose: biocenoseAdapter, trinity: trinityAdapter
});

module.exports = { KNOWN_TOPOLOGIES, createRegistry,
  build: defaultRegistry.build, register: defaultRegistry.register,
  resolve: defaultRegistry.resolve };
