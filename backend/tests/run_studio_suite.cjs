'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const suites = [
  'test_studio_client.mjs', 'test_studio_request_safety.mjs', 'test_studio_action_state.mjs',
  'test_studio_context_guard.mjs',
  'test_studio_optional_mcp.cjs',
  'test_studio_worlds.cjs',
  'test_studio_memory.cjs',
  'test_studio_routes.mjs', 'test_studio_records.mjs', 'test_studio_onboarding.mjs',
  'test_studio_events.mjs', 'test_studio_comparison.mjs', 'test_studio_management.cjs',
  'test_studio_files.cjs', 'test_studio_multiprocess.cjs', 'test_studio_operations.cjs', 'test_studio_restart.cjs',
  'test_studio_research.cjs'
];
for (const file of suites) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: 'inherit', windowsHide: true, timeout: 180000
  });
  if (result.error || result.status !== 0) {
    console.error('Studio suite failed:', file, result.error?.message || result.status);
    process.exit(1);
  }
}
console.log(`Studio suite: ${suites.length}/${suites.length} passed on ${process.platform}.`);
