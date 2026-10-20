'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backendRoot = path.resolve(__dirname, '..');
const checks = [
  { topology: 'Trinity contracts', scripts: [['tests/run_trinity_suite.js']] },
  { topology: 'Trinity mission qualification', scripts: [['tests/test_gqwf_trinity_mission_qualification.js']] },
  { topology: 'A-Team execution and waits', scripts: [
    ['tests/test_ateam_execution_e2e.js'], ['tests/test_ateam_terminal_wait.js'],
    ['tests/test_ateam_multiteam_runtime.js']] },
  { topology: 'Biome resource feedback', scripts: [['tests/run_biome_suite.js']] },
  { topology: 'Biocenose member deliberation', scripts: [['tests/run_biocenose_suite.js']] },
  { topology: 'Rhizome persistent execution', scripts: [['tests/run_rhizome_suite.js']] },
  { topology: 'Syncytium state invariants', scripts: [['tests/run_syncytium_suite.js']] },
  { topology: 'Holobiont host integration', scripts: [['tests/run_holobiont_suite.js']] },
  { topology: 'Metapopulation completion and migration',
    scripts: [['tests/run_validation_suite.js', 'metapopulation']] },
  { topology: 'Biological receipts and restart', scripts: [['tests/run_biology_suite.cjs']] }
];

function execute(check) {
  console.log(`\n=== ${check.topology} ===`);
  for (const [script, ...args] of check.scripts) {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: backendRoot, stdio: 'inherit', timeout: 600000, windowsHide: true
    });
    if (result.status !== 0) return { topology: check.topology,
      reason: result.error?.message || `exit ${result.status}` };
  }
  return null;
}

function main() {
  const failures = checks.map(execute).filter(Boolean);
  console.log(`\nTopology contract checks: ${checks.length - failures.length}/${checks.length} passed.`);
  console.log('These controlled contract tests do not certify live production execution.');
  if (failures.length) {
    console.error(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
}

main();
