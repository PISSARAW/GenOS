'use strict';

const { KNOWN_TOPOLOGIES, createRegistry } = require('./registry');
const aTeamAdapter = require('./aTeamAdapter');
const biocenoseAdapter = require('./biocenoseAdapter');
const biomeAdapter = require('./biomeAdapter');
const holobionteAdapter = require('./holobionteAdapter');
const metapopulationAdapter = require('./metapopulationAdapter');
const trinityAdapter = require('./trinityAdapter');

const defaultRegistry = createRegistry({
  a_team: aTeamAdapter, biocenose: biocenoseAdapter, biome: biomeAdapter,
  holobionte: holobionteAdapter, metapopulation: metapopulationAdapter,
  trinity: trinityAdapter
});

module.exports = { KNOWN_TOPOLOGIES, createRegistry,
  build: defaultRegistry.build, register: defaultRegistry.register,
  resolve: defaultRegistry.resolve };
