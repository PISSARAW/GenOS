'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROTOCOL_PATH = path.join(__dirname, 'protocol.json');
const PROTOCOL = Object.freeze(JSON.parse(fs.readFileSync(PROTOCOL_PATH, 'utf8')));

function scenarioValid(scenario) {
  return scenario && typeof scenario.id === 'string'
    && Number.isSafeInteger(scenario.agents) && scenario.agents > 1
    && Number.isSafeInteger(scenario.tasks) && scenario.tasks > 0
    && Number.isSafeInteger(scenario.seed) && scenario.seed >= 0;
}

function assertProtocol(protocol = PROTOCOL) {
  const scenarios = [protocol.primaryScenario, ...(protocol.scaleScenarios || [])];
  const ids = new Set((protocol.arms || []).map((arm) => arm.id));
  if (protocol.protocolVersion !== 'genos.communication-economy/v1'
    || !scenarios.every(scenarioValid) || ids.size !== 4
    || !ids.has('agentsociety') || !protocol.controls?.sameTaskSet
    || !protocol.controls?.sameModel || !protocol.costPolicy?.neverEstimateTokensFromCharacters) {
    throw new Error('Communication economy protocol is incomplete or inconsistent.');
  }
  return protocol;
}

module.exports = { PROTOCOL, assertProtocol };
