const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SANCTIONED = new Set([
  'src/services/workerGarageService.js',
  'tests/test_worker_idle_lifecycle.js',
].map(p => path.normalize(p)));
const ORCHESTRATOR_EXEMPT = new Set([
  'bin/orchestratorMissionHelpers.cjs',
  'src/services/primitiveHandlers/safetyRelease.js',
].map(p => path.normalize(p)));

function listProdFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      listProdFiles(full, out);
    } else if (/\.(js|cjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function testIdleTransitionsCentralized() {
  const files = listProdFiles(path.join(ROOT, 'src'), []);
  listProdFiles(path.join(ROOT, 'bin'), files);
  const offenders = [];
  for (const full of files) {
    const rel = path.relative(ROOT, full);
    if (SANCTIONED.has(rel) || ORCHESTRATOR_EXEMPT.has(rel)) continue;
    const source = fs.readFileSync(full, 'utf8');
    if (/SET\s+status\s*=\s*['"]idle['"]/i.test(source)) offenders.push(rel);
  }
  assert.deepStrictEqual(offenders, [], `Worker idle writes outside workerGarageService: ${offenders.join(', ')}`);
}

function testEnterIdleStateArmsWake() {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/workerGarageService.js'), 'utf8');
  assert.match(source, /async function enterIdleState/);
  assert.match(source, /armWakeHandler\(agentId\)/);
}

function testFallbackCallersUseLifecycle() {
  const deployHelpers = fs.readFileSync(path.join(ROOT, 'src/controllers/deployHelpers.js'), 'utf8');
  assert.match(deployHelpers, /enterIdleState/);
  assert.doesNotMatch(deployHelpers, /SET\s+status='idle'/);
  const safety = fs.readFileSync(path.join(ROOT, 'src/services/primitiveHandlers/safetyRelease.js'), 'utf8');
  assert.match(safety, /enterIdleState/);
}

async function run() {
  testIdleTransitionsCentralized();
  console.log('[PASS] idle transitions centralized in workerGarageService');
  testEnterIdleStateArmsWake();
  console.log('[PASS] enterIdleState arms wake handler');
  testFallbackCallersUseLifecycle();
  console.log('[PASS] fallback callers route through lifecycle');
  console.log('\nAll worker idle lifecycle tests passed.');
}

run().catch((err) => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
