'use strict';

const assert = require('node:assert/strict');
const executable = require('../src/services/agentRuntimeExecutable');
const final = require('../src/services/qualityElevation/qualityFinalExecution');

function context(mission = {}) {
  const normalizedMission = { qualityElevation: { domain: 'creative_writing', profile: 'prose' }, ...mission };
  return { normalizedMission, executable: executable.configuredExecutable(normalizedMission),
    dispatchedAgent: { execution_mode: 'orchestrator' }, agentId: 'parent', executionRun: { id: 'final-run' } };
}

function resolvedExecutors() {
  const savedExecutor = process.env.GENOS_AGENT_EXECUTOR, savedModel = process.env.GENOS_LOCAL_MODEL;
  try {
    delete process.env.GENOS_AGENT_EXECUTOR; delete process.env.GENOS_LOCAL_MODEL;
    for (const executor of ['codex', 'caller_mcp', 'hermes']) {
      assert.throws(() => final.prepareNativeFinal(context({ executor })), { code: 'GQEL_EXECUTOR_UNSUPPORTED' });
    }
    assert.throws(() => final.prepareNativeFinal(context()), { code: 'GQEL_EXECUTOR_UNSUPPORTED' });
    process.env.GENOS_AGENT_EXECUTOR = 'codex';
    assert.throws(() => final.prepareNativeFinal(context()), { code: 'GQEL_EXECUTOR_UNSUPPORTED' });
    process.env.GENOS_AGENT_EXECUTOR = 'local';
    const native = context(); final.prepareNativeFinal(native);
    assert.equal(native.normalizedMission.workerKind, 'creative_worker');
    assert.equal(final.executionEntrypoint(native, () => 'external'), require.resolve('../src/services/agentFleetService'));
    const windows = context({ executor: 'local', localRuntime: true });
    assert.doesNotThrow(() => final.prepareNativeFinal(windows));
    const localParent = context({ executor: 'local', localRuntime: true, localModel: 'ollama://author' });
    final.prepareNativeFinal(localParent); assert.equal(final.earlyWorker(localParent), false);
    assert.equal(final.earlyWorker({ ...localParent, normalizedMission: { ...localParent.normalizedMission,
      qualityElevation: undefined, inProcessWorker: true }, dispatchedAgent: { execution_mode: 'worker' } }), true);
    const generic = context({ executor: 'local', qualityElevation: { domain: 'generic', profile: 'prose' } });
    final.prepareNativeFinal(generic); assert.equal(generic.normalizedMission.workerKind, 'synthesis_worker');
    assert.throws(() => final.prepareNativeFinal(context({ executor: 'local', qualityElevation: { profile: 'code' } })),
      { code: 'GQEL_FINAL_CODE_VERIFICATION_REQUIRED' });
    const code = context({ executor: 'local', qualityElevation: { profile: 'code' }, localCodeWorker: true,
      executionPolicy: { allowFileEdits: true } });
    final.prepareNativeFinal(code); assert.equal(code.normalizedMission.workerKind, 'bounded_worker');
    const plain = context({ executor: 'codex', qualityElevation: undefined });
    assert.doesNotThrow(() => final.prepareNativeFinal(plain));
    assert.equal(final.executionEntrypoint(plain, () => 'external'), 'external');
  } finally {
    if (savedExecutor === undefined) delete process.env.GENOS_AGENT_EXECUTOR; else process.env.GENOS_AGENT_EXECUTOR = savedExecutor;
    if (savedModel === undefined) delete process.env.GENOS_LOCAL_MODEL; else process.env.GENOS_LOCAL_MODEL = savedModel;
  }
}

async function nativeFinalRouting() {
  const workspace = require('../src/services/agentWorkspaceLifecycleService');
  const attestation = require('../src/services/trinityRuntimeAttestation');
  const runtime = require('../src/services/missionProtocols/runtime');
  const fleet = require('../src/services/agentFleetService');
  const originals = { track: workspace.trackWorkspace, attest: attestation.recordInProcess,
    run: runtime.runInProcess, worker: fleet.runLocalWorker };
  const calls = [];
  workspace.trackWorkspace = async () => { calls.push('workspace'); };
  attestation.recordInProcess = async () => { calls.push('attestation'); };
  runtime.runInProcess = async (_ctx, action) => { calls.push('protocol'); return action(); };
  fleet.runLocalWorker = async () => { calls.push('native-final'); return 'final-artifact'; };
  try {
    const ctx = context({ executor: 'local', localRuntime: true, localModel: 'ollama://author' }); final.prepareNativeFinal(ctx);
    assert.equal(final.earlyWorker(ctx), false);
    calls.push('workers', 'barrier');
    assert.equal(await final.finish(ctx, () => { throw Error('Unsupported subprocess path'); }), 'final-artifact');
    assert.deepEqual(calls, ['workers', 'barrier', 'workspace', 'attestation', 'protocol', 'native-final']);
    assert.equal(await final.finish(context({ qualityElevation: undefined }), () => 'unchanged'), 'unchanged');
  } finally {
    workspace.trackWorkspace = originals.track; attestation.recordInProcess = originals.attest;
    runtime.runInProcess = originals.run; fleet.runLocalWorker = originals.worker;
  }
}

async function main() {
  resolvedExecutors(); await nativeFinalRouting();
  console.log('GQEL final execution: resolved local/env/default executors, pre-seal artifact kinds, protected code requirement and native post-barrier routing PASS (stubbed launch effects).');
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
