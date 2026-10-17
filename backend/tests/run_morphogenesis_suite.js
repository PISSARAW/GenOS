'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ensureMorphogenesisCli } = require('./helpers/morphogenesisCliPreflight.cjs');
const genosBin = ensureMorphogenesisCli();
const tests = fs.readdirSync(__dirname).filter(name => /^test_.*(morphogenesis|morphogenetic|morphology).*\.js$/.test(name));
tests.push('morphogenesis/test_learning_services.js');
tests.push('morphogenesis/test_mission_strategy_compiler.js');
tests.push('morphogenesis/test_conditional_morphogenesis_policy.js');
tests.push('morphogenesis/test_intervention_paired_corpus.js');
tests.push('morphogenesis/test_adaptive_topology_candidates.js');
tests.push('morphogenesis/test_adaptive_topology_ranking.js');
tests.push('morphogenesis/test_adaptive_worker_roster.js');
tests.push('morphogenesis/test_light_intervention_scales.js');
tests.push('test_intra_epoch_adaptation.js');
tests.push('test_mission_strategy_activation.js');
tests.push('test_mission_worker_runtime_snapshot.js');
const failures = [];
for (const name of tests.sort()) {
  const result = spawnSync(process.execPath, [path.join(__dirname, name)], { encoding: 'utf8', timeout: 120000,
    env: { ...process.env, GENOS_BIN: genosBin,
      GENOS_ADMIN_PASSWORD: process.env.GENOS_ADMIN_PASSWORD || 'morphogenesis-suite-only' } });
  if (result.status !== 0) {
    failures.push(name); console.error('FAIL', name, result.error?.message || '', result.stdout, result.stderr);
  } else console.log('PASS', name);
}
console.log('Morphogenesis suite:', tests.length - failures.length, '/', tests.length, 'passed');
if (failures.length) process.exitCode = 1;
