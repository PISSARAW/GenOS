'use strict';

const path = require('node:path');

const SCENARIO_RUNNERS = Object.freeze({
  'V2-01': { file: 'run-v2-01.cjs', arms: ['genos-full', 'static-social-graph', 'llm-with-memory', 'genos-without-relational-physiology'], executableArms: [] },
  'V2-02': { file: 'run-v2-02.cjs', arms: ['genos-full', 'static-social-graph', 'llm-with-memory', 'genos-without-relational-physiology'], executableArms: [] },
  'V2-03': { file: 'run-v2-03.cjs', arms: ['genos-full', 'static-social-graph', 'llm-with-memory'], executableArms: ['genos-full'] },
  'V2-04': { file: 'run-v2-04.cjs', arms: ['genos-full', 'static-social-graph', 'llm-with-memory'], executableArms: [] },
  'V2-05': { file: 'run-v2-05.cjs', arms: ['genos-full', 'static-social-graph', 'llm-with-memory', 'genos-without-relational-physiology'], executableArms: ['genos-full', 'static-social-graph'] },
  'V2-06': { file: 'run-v2-06.cjs', arms: ['genos-full', 'static-social-graph', 'llm-with-memory', 'genos-without-relational-physiology', 'genos-social-memory-ablated', 'genos-social-memory-counterfactual'], executableArms: [] },
});

function runnerPath(scenarioId) {
  const descriptor = SCENARIO_RUNNERS[scenarioId];
  return descriptor ? path.join(__dirname, descriptor.file) : null;
}

function runnerDescriptor(scenarioId) {
  return SCENARIO_RUNNERS[scenarioId] || null;
}

function loadRunner(scenarioId) {
  const filename = runnerPath(scenarioId);
  if (!filename) throw new Error(`No SocialWorld V2 runner is registered for ${scenarioId}.`);
  return require(filename);
}

module.exports = { SCENARIO_RUNNERS, loadRunner, runnerDescriptor, runnerPath };
