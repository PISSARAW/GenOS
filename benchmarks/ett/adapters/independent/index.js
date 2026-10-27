'use strict';

const { createReactClassic } = require('./reactClassic');
const { createPeriodicLlmLoop } = require('./periodicLlmLoop');
const { createVoyagerAdapted } = require('./voyagerAdapted');
const { createAiScientistV2Adapted } = require('./aiScientistV2Adapted');
const { createDarwinGodelMachineAdapted } = require('./darwinGodelMachineAdapted');

const FACTORIES = Object.freeze({
  react_classic: createReactClassic,
  periodic_llm_loop: createPeriodicLlmLoop,
  voyager_adapted: createVoyagerAdapted,
  ai_scientist_v2_adapted: createAiScientistV2Adapted,
  darwin_godel_machine_adapted: createDarwinGodelMachineAdapted
});
const SYSTEM_IDS = Object.freeze(Object.keys(FACTORIES));

function createIndependentAdapter(systemId, config) {
  const factory = FACTORIES[systemId];
  if (!factory) throw new Error(`Unknown independent adapter: ${systemId}`);
  return factory(config);
}

module.exports = { SYSTEM_IDS, createIndependentAdapter };
