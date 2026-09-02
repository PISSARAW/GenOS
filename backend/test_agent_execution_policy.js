const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const hook = path.resolve(__dirname, 'bin/genos-pre-tool-policy.cjs');
function invoke(toolName, command, env = {}) {
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: { command } }),
    encoding: 'utf8',
    env: { ...process.env, GENOS_ALLOWED_COMMANDS_JSON: '["node --test dp_partition.test.mjs"]', ...env }
  });
}

assert.strictEqual(invoke('Bash', 'node --test dp_partition.test.mjs').stdout, '');
const deniedCommand = JSON.parse(invoke('Bash', 'git status').stdout);
assert.strictEqual(deniedCommand.hookSpecificOutput.permissionDecision, 'deny');
assert.match(deniedCommand.hookSpecificOutput.permissionDecisionReason, /outside the GenOS execution policy/);
const deniedEdit = JSON.parse(invoke('apply_patch', '*** Begin Patch').stdout);
assert.strictEqual(deniedEdit.hookSpecificOutput.permissionDecision, 'deny');
assert.strictEqual(invoke('apply_patch', '*** Begin Patch', { GENOS_ALLOW_FILE_EDITS: 'true' }).stdout, '');
console.log('GenOS execution-policy hook checks passed.');
