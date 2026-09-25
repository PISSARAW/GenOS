#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const TEST_ROOT = path.resolve(__dirname, '../tests');
const PHASES = Object.freeze([
  { name: 'Contrat, fixtures, collecte de base et garde parser', tests: [
    'test_comparative_mission_contract.js', 'test_comparative_mission_fixtures.js',
    'test_comparative_mission_result_gate.js'
  ] },
  { name: 'Migration validée par le receveur', tests: ['test_metapopulation_migration_review.js'] },
  { name: 'Évaluateurs locaux et dispatch worker', tests: [
    'test_comparative_mission_evaluation.js', 'test_topology_worker_launch_payload.js'
  ] }
]);

function main() {
  for (const phase of PHASES) {
    process.stdout.write(`\n[validation comparative] ${phase.name}\n`);
    for (const test of phase.tests) runTest(test);
  }
  process.stdout.write('\n[validation comparative] PASS\n');
}

function runTest(test) {
  const result = spawnSync(process.execPath, [path.join(TEST_ROOT, test)], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${test} failed with status ${result.status}.`);
}

try { main(); } catch (error) {
  process.stderr.write(`[validation comparative] ${error.message}\n`);
  process.exitCode = 1;
}
