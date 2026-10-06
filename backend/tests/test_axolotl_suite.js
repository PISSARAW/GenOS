'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const suites = ['partial_regeneration', 'regeneration_learning', 'cognitive_sources', 'metamorphosis',
  'regeneration_cost', 'strategy_selection', 'runtime', 'recovery_gates'];
for (const suite of suites) {
  const result = spawnSync(process.execPath, [path.join(__dirname, `test_axolotl_${suite}.js`)], { stdio: 'inherit', timeout: 60000 });
  if (result.error || result.status !== 0) { console.error(result.error || `Axolotl suite failed: ${suite}`); process.exit(1); }
}
console.log('Axolotl: all 8 suites passed.');