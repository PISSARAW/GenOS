'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const related = [
  'test_topology_orchestrator_dispatch_members.js', 'test_self_model_service.js',
  'test_homeostasis_continuation.js', 'test_homeostasis_durable_authority.js',
  'test_homeostasis_authority_receipts.js', 'test_mission_continuity.js',
  'test_mission_regeneration.js', 'test_mission_identity.js', 'test_worker_runtime_completion.js'
];

const discovered = fs.readdirSync(__dirname).filter((name) => /^test_(orchestrator|orchestration|autonomous_orchestration|sub_orchestrator|agent_process).*\.js$/.test(name));
const tests = [...new Set([...discovered, ...related.filter((name) => fs.existsSync(path.join(__dirname, name)))])].sort();
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-orchestrator-suite-'));
const results = [];

try {
  for (const name of tests) {
    const result = spawnSync(process.execPath, [path.join(__dirname, name)], {
      cwd: path.join(__dirname, '../..'), encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GENOS_DB_PATH: path.join(directory, `${name}.db`), GENOS_DB_BACKUP_SKIP: '1', GENOS_ADMIN_PASSWORD: 'orchestrator-suite-test-only' }
    });
    const success = result.status === 0;
    results.push({ test: name, success, exitCode: result.status, error: result.error?.message });
    console.log(`${success ? 'PASS' : 'FAIL'} ${name}`);
    if (!success) console.error(`${result.stdout || ''}\n${result.stderr || ''}\n${result.error?.message || ''}`);
  }
  const failed = results.filter((result) => !result.success);
  console.log(`Orchestrator suite: ${results.length - failed.length}/${results.length} passed.`);
  if (process.env.GENOS_ORCHESTRATOR_TEST_REPORT) fs.writeFileSync(process.env.GENOS_ORCHESTRATOR_TEST_REPORT, JSON.stringify({ results }, null, 2));
  if (failed.length) process.exitCode = 1;
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
