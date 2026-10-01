'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { handle } = require('./session-hook.cjs');
const storage = require('./session-state.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-hook-test-'));
const input = { cwd: root, session_id: 'session-a' };
const call = (fields) => handle({ ...input, ...fields });
const success = { content: [{ type: 'text', text: '{"success":true}' }] };

try {
  execFileSync('git', ['init', '-q', root]);
  fs.writeFileSync(path.join(root, '.gitignore'), '.genos-agent-worlds/\n');
  fs.writeFileSync(path.join(root, 'code.js'), 'initial');
  call({ hook_event_name: 'SessionStart' });
  assert.equal(call({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch' }).hookSpecificOutput.permissionDecision, 'deny');
  const place = storage.location(input);
  const state = storage.load(place);
  const checkpoint = { hook_event_name: 'PostToolUse', tool_name: 'mcp__genos__genos_snapshot', tool_input: { out: state.snapshot } };
  call({ ...checkpoint, tool_response: { ...success, isError: true } });
  assert.equal(storage.load(place).checkpoint, undefined);
  fs.writeFileSync(state.snapshot, JSON.stringify({ agent_id: state.session, snapshot_id: 'real-artifact' }));
  call({ ...checkpoint, tool_response: success });
  assert.deepEqual(call({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch' }), {});
  fs.writeFileSync(path.join(root, 'code.js'), 'changed');
  assert.equal(call({ hook_event_name: 'Stop' }).decision, 'block');
  const test = { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } };
  call({ ...test, tool_response: { output: 'looks successful' } });
  assert.equal(call({ hook_event_name: 'Stop' }).decision, 'block');
  call({ ...test, tool_response: { exit_code: 1 } });
  assert.equal(call({ hook_event_name: 'Stop' }).decision, 'block');
  call({ ...test, tool_response: 'Process exited with code 0' });
  assert.equal(call({ hook_event_name: 'Stop' }).decision, 'block');
  call({ hook_event_name: 'PostToolUse', tool_name: 'mcp__genos__genos_record_experience', tool_input: { agentId: state.session }, tool_response: { content: [{ type: 'text', text: '{"success":true,"episodeId":"episode-real"}' }] } });
  assert.deepEqual(call({ hook_event_name: 'Stop' }), {});
  fs.writeFileSync(path.join(root, 'code.js'), 'changed again');
  assert.equal(call({ hook_event_name: 'Stop' }).decision, 'block');
  assert.ok(call({ hook_event_name: 'PostCompact' }).hookSpecificOutput.additionalContext.includes('Checkpoint=true'));
  const other = storage.load(storage.location({ ...input, session_id: 'session-b' }));
  assert.equal(other.checkpoint, undefined);
  fs.mkdirSync(path.join(place.directory, 'hook.lock'));
  assert.throws(() => call({ hook_event_name: 'Stop' }), /EEXIST/);
  fs.rmdirSync(path.join(place.directory, 'hook.lock'));
  console.log('Session isolation, checkpoint gate, failed tests, stale evidence and resume verified.');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
