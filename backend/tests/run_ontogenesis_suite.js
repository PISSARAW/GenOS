'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const related = ['test_shev_project_loop.js', 'test_shev_data_freshness.js', 'test_shev_runtime_demo.js',
  'test_philosophy_ontogenesis_integration.js', 'test_philosophy_observation_binding.js'];
const scenarios = ['invalidConfiguration', 'operatorCommands', 'cancellation', 'pausedCandidate',
  'recovery', 'failureAccounting', 'silentResident'];
const tests = [...new Set([...fs.readdirSync(__dirname).filter((name) => /^test_ontogenesis_.*\.js$/.test(name)), ...related])].sort();
function groupsFor(name) {
  if (name === 'test_ontogenesis_completion.js') return scenarios;
  if (name === 'test_ontogenesis_concept_registry.js') return ['registry', 'foundations', 'adapters'];
  return [null];
}
const checks = tests.flatMap((name) => groupsFor(name)
  .map((scenario) => ({ name, args: scenario ? [scenario] : [] })));
for (const check of checks) {
  console.log('\n[ontogenesis]', check.name, ...check.args);
  const result = spawnSync(process.execPath, [path.join(__dirname, check.name), ...check.args], {
    cwd: path.resolve(__dirname, '..'), stdio: 'inherit', windowsHide: true, timeout: 300000
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('\nOntogenesis:', tests.length, 'suites passed;', checks.length, 'isolated checks passed.');
