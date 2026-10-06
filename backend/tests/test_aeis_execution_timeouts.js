'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const adapters = require('../src/services/epistemic/verifierAdapters');
const { resolvedOutcome } = require('../src/services/epistemic/immuneMemoryRepository');
async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aeis-timeout-'));
  try {
    fs.writeFileSync(path.join(root, 'slow.js'), "setTimeout(() => process.stdout.write('finished'), 250);");
    const context = { allowedWorkspaceRoot: root, timeoutMs: 20 };
    const test = await adapters.runTestAdapter({}, { test: { command: 'node slow.js', cwd: root } }, context);
    assert.equal(test.status, 'inconclusive');
    assert.equal(test.counterexamples.length, 0);
    const build = await adapters.runArtifactAdapter({}, { artifact: { buildCommand: 'node slow.js', cwd: root } }, context);
    assert.equal(build.status, 'inconclusive');
    assert.equal(build.counterexamples.length, 0);
    const receipt = { status: 'refuted', executionEvidence: [{ command: 'node slow.js', exitCode: -1, timedOut: true }] };
    assert.equal(resolvedOutcome([receipt], { command: 'node slow.js' }, false), null);
    console.log('AEIS execution timeout abstains without recording a false refutation: PASS');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
