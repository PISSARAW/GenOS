const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const gate = require('../src/services/agentCapsuleGate');
const capsules = require('../src/services/agentCapsuleService');

function codeIs(expected) {
  return (error) => error && error.code === expected;
}

// N5a: agentId traversal / separators / absolute / empty are rejected.
for (const bad of ['..', '../etc', 'a/b', 'a\\b', '/abs', 'C:\\win', '', ' bad', '-lead', 'a'.repeat(129)]) {
  assert.throws(() => gate.assertSafeAgentId(bad), codeIs('CAPSULE_AGENT_ID_INVALID'), `must reject ${JSON.stringify(bad)}`);
}
assert.equal(gate.assertSafeAgentId('agent-1_X'), 'agent-1_X');

// N5b: containment — a hostile agentId can never produce an escaping root.
assert.throws(() => gate.resolveCapsulePaths({ capsuleRoot: os.tmpdir(), agentId: '..' }), codeIs('CAPSULE_AGENT_ID_INVALID'));
const ok = gate.resolveCapsulePaths({ capsuleRoot: os.tmpdir(), agentId: 'agent-test' });
assert.ok(ok.root.startsWith(path.resolve(os.tmpdir())), 'root must stay inside capsuleRoot');
assert.ok(ok.bootstrap.startsWith(ok.root), 'bootstrap must stay inside root');

// N5c: executable gating — bare names allowed, `..`/separators rejected,
// absolute paths must exist.
assert.equal(gate.resolveExecutable('node'), 'node');
assert.throws(() => gate.resolveExecutable('foo/../bar'), codeIs('CAPSULE_EXECUTABLE_INVALID'));
assert.throws(() => gate.resolveExecutable('./evil'), codeIs('CAPSULE_EXECUTABLE_INVALID'));
assert.throws(() => gate.resolveExecutable('/nonexistent/abs-bin'), codeIs('CAPSULE_EXECUTABLE_MISSING'));
const selfAbs = process.execPath;
assert.equal(gate.resolveExecutable(selfAbs), selfAbs);

// N5d: provision refuses hostile input before spawning anything.
async function main() {
  await assert.rejects(
    capsules.provision({ capsuleRoot: os.tmpdir(), agentId: '../../escape', executable: 'node' }),
    codeIs('CAPSULE_AGENT_ID_INVALID')
  );
  await assert.rejects(
    capsules.provision({ capsuleRoot: os.tmpdir(), agentId: 'agent-test', executable: 'evil/../bin' }),
    codeIs('CAPSULE_EXECUTABLE_INVALID')
  );
  // No escape directory may have been created next to the tmp root.
  assert.equal(fs.existsSync(path.resolve(os.tmpdir(), '..', 'escape')), false);
  console.log('Capsule N5 non-regression checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
