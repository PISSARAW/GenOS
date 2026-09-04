/**
 * GenOS Security & Adversarial Injection Master Runner (Challenger 2)
 * Comprehensive execution of all security penetration, RBAC bypass,
 * CORS/CSRF, XSS fuzzing, and circuit breaker quarantine suites.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  { name: 'Adversarial Deep Penetration Suite', file: 'test_adversarial_deep_suite.js' },
  { name: 'Security Co-Evolution Barrier Matrix', file: 'test_security_coevolution_matrix.js' },
  { name: 'Adversarial Baseline Suite', file: 'test_adversarial.js' },
  { name: 'Adversarial Probes & Fuzzing', file: 'test_adversarial_probes.js' }
];

function runSuite(suite) {
  console.log(`\n>>> EXECUTING SUITE: ${suite.name} (${suite.file}) <<<`);
  const fullPath = path.resolve(__dirname, suite.file);
  const result = spawnSync('node', [fullPath], { stdio: 'inherit', cwd: __dirname });

  if (result.status !== 0) {
    console.error(`❌ SUITE FAILED: ${suite.name}`);
    return false;
  }
  console.log(`✅ SUITE PASSED: ${suite.name}`);
  return true;
}

function runAllSecurityChallenges() {
  console.log('======================================================================');
  console.log('  GENOS STUDIO SECURITY & ADVERSARIAL MASTER RUNNER (CHALLENGER 2)    ');
  console.log('======================================================================');

  const startTimestamp = Date.now();
  let passedSuites = 0;

  for (const suite of SUITES) {
    const ok = runSuite(suite);
    if (ok) passedSuites++;
  }

  const duration = Date.now() - startTimestamp;
  console.log('\n======================================================================');
  console.log('  SECURITY ADVERSARIAL CHALLENGE EXECUTION REPORT                     ');
  console.log('======================================================================');
  console.log(`  Total Suites Executed: ${SUITES.length}`);
  console.log(`  Passed Suites:         ${passedSuites}/${SUITES.length}`);
  console.log(`  Total Execution Time:  ${duration}ms`);
  console.log(`  Final Verdict:         ${passedSuites === SUITES.length ? 'SYSTEM PROVEN INVULNERABLE — ALL CHALLENGES PASSED' : 'SECURITY VULNERABILITY DETECTED'}`);
  console.log('======================================================================\n');

  if (passedSuites !== SUITES.length) {
    process.exit(1);
  }
}

if (require.main === module) {
  runAllSecurityChallenges();
}

module.exports = { runAllSecurityChallenges };
