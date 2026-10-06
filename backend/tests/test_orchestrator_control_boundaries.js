'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { actionArguments, confinedPath } = require('../src/services/orchestrationActionArguments');
const status = require('../src/services/orchestratorMissionStatus');
const { isDecisionEvent } = require('../src/services/orchestrationDecisionService');

function assertArguments(root) {
  const decision = { tool: 'genos_snapshot', action: 'quarantine_and_fork' };
  assert.equal(actionArguments(decision, { payload: { agent: '../outside.json' } }, root), null);
  assert.equal(actionArguments(decision, { payload: { out: '../outside.json' } }, root), null);
  assert.equal(actionArguments(decision, { payload: { agent: 'agent.json', out: 'agent.json' } }, root), null);
  assert.equal(confinedPath(root, ''), null);
  assert.equal(confinedPath(root, '..'), null);
  assert.equal(confinedPath(root, path.dirname(root)), null);
  assert.equal(actionArguments(decision, { payload: {} }, null), null);
  const proposal = { proposal: { changedFiles: ['a.js'], tests: [] } };
  assert.equal(actionArguments({ tool: 'genos_record_experience' }, { payload: proposal }, root).successful, false);
  proposal.proposal.tests = [{ command: 'node test.js', exitCode: 0 }];
  assert.equal(actionArguments({ tool: 'genos_record_experience' }, { payload: proposal }, root).successful, true);
  proposal.proposal.tests.push({ command: 'node other.js', exitCode: 1 });
  assert.equal(actionArguments({ tool: 'genos_record_experience' }, { payload: proposal }, root).successful, false);
}

function assertSymlinkConfinement(directory) {
  const root = path.join(directory, 'workspace');
  const outside = path.join(directory, 'outside');
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  const link = path.join(root, 'escape');
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(confinedPath(root, 'escape/snapshot.json'), null);
  assert.equal(confinedPath(root, 'new/snapshot.json'), path.join(root, 'new', 'snapshot.json'));
  assertArguments(root);
}

function assertCompletionGates() {
  const completed = { success: true, verdict: 'completed' };
  const coverage = { verdict: 'required-coverage-complete' };
  assert.deepEqual(status.resolveFinalMissionStatus(completed, { allowed: true }, { verdict: 'completed', coverage }), { success: true, verdict: 'completed' });
  assert.equal(status.resolveFinalMissionStatus(completed, { allowed: false }, { verdict: 'completed', coverage }).success, false);
  assert.equal(status.resolveFinalMissionStatus(completed, { allowed: true }, { verdict: 'completed' }).verdict, 'required_coverage_incomplete');
  assert.equal(status.resolveFinalMissionStatus({ success: false, verdict: 'failed' }, { allowed: true }, { verdict: 'completed', coverage }).success, false);
  assert.equal(status.agentsQuiescent([{ status: 'completed', runtime_pid: 42 }]), false);
  assert.equal(status.agentsQuiescent([{ status: 'completed', runtime_pid: null }]), true);
  assert.equal(status.agentsQuiescent([]), false);
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-orchestrator-boundaries-'));
try {
  assertSymlinkConfinement(directory);
  assertCompletionGates();
  assert.equal(isDecisionEvent({ eventType: 'AGENT_STEP' }), false);
  assert.equal(isDecisionEvent({ eventType: 'AGENT_COMPLETED' }), true);
  console.log('Orchestrator boundaries: snapshots, symlinks, empty tests, quiescence and completion gates passed.');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
