const assert = require('assert');
const {
  detectExecutionKind,
  isRegisteredTool,
  isSupportedTool
} = require('../src/services/mcpToolRegistry');

assert.strictEqual(isRegisteredTool('genos_snapshot'), true);
assert.strictEqual(isSupportedTool('genos_snapshot'), true);
assert.strictEqual(detectExecutionKind('genos_snapshot'), 'cli');

assert.strictEqual(isRegisteredTool('genos_nonexistent'), false);
assert.strictEqual(isSupportedTool('genos_nonexistent'), false);
assert.strictEqual(detectExecutionKind('genos_nonexistent'), 'unsupported');

for (const publicTool of [
  'genos_orchestrate', 'genos_delegate_worker', 'genos_change_strategy', 'genos_report_progress',
  'genos_change_organization', 'genos_organization_state', 'genos_worker_publish', 'genos_worker_inbox',
  'genos_capsule_create', 'genos_v2_init', 'genos_v2_fork', 'genos_trinity_launch',
  'genos_a_team_preview', 'genos_audit', 'genos_biomimicry', 'genos_merge'
]) {
  assert.strictEqual(isRegisteredTool(publicTool), true, `${publicTool} must be registered in the backend catalog`);
}

console.log('MCP catalog registry checks passed.');