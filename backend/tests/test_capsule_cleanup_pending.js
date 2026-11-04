'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const gate = require('../src/services/agentCapsuleGate');

function loadService(boundary) {
  const file = path.resolve(__dirname, '../src/services/agentCapsuleService.js');
  const local = createRequire(file);
  const module = { exports: {} };
  vm.runInNewContext(fsSync.readFileSync(file, 'utf8'), {
    module, exports: module.exports, process, Buffer, console,
    require: (name) => name === './capsuleProcessBoundary' ? boundary : local(name)
  }, { filename: file });
  return module.exports;
}

function input(root, label) {
  const agentId = `worker-${label}`;
  return { capsuleRoot: root, workspaceRoot: path.join(root, 'workspace'),
    executable: process.execPath, agentId, fallbackSynthetic: true,
    correlation: { missionId: 'capsule-cleanup', worldId: 'world', workerId: agentId, runId: label } };
}

function failureBoundary(error) {
  const state = { calls: 0 };
  state.run = async (_command, _args, options) => {
    state.calls++;
    await fs.writeFile(path.join(options.root, 'possibly-live.txt'), 'preserve');
    throw error;
  };
  return state;
}

async function unconfirmed(root) {
  const error = Object.assign(new Error('Termination not observed'), {
    code: 'CAPSULE_BOOTSTRAP_TERMINATION_UNCONFIRMED', cleanupPending: true
  });
  const boundary = failureBoundary(error);
  const service = loadService(boundary);
  const request = input(root, 'unconfirmed');
  const target = gate.resolveCapsulePaths(request).root;
  await assert.rejects(service.provision(request), (actual) => actual === error);
  assert.equal(await fs.readFile(path.join(target, 'possibly-live.txt'), 'utf8'), 'preserve');
  assert.equal(boundary.calls, 1);
  await assert.rejects(service.provision(request), /Unsealed capsule exists/);
  await assert.rejects(service.provisionSynthetic(request), /Unsealed capsule exists/);
  assert.equal(boundary.calls, 1, 'Neither retry nor requested fallback may replace an unsealed live capsule');
  assert.equal(fsSync.existsSync(path.join(target, 'capsule-seal.json')), false);
}

async function noImplicitFallback(root) {
  const error = Object.assign(new Error('stdout failed'), { code: 'CAPSULE_BOOTSTRAP_IO_ERROR' });
  const boundary = failureBoundary(error);
  const service = loadService(boundary);
  const request = { ...input(root, 'closed'), correlation: undefined, fallbackSynthetic: undefined };
  await assert.rejects(service.provision(request), (actual) => actual === error);
  assert.equal(boundary.calls, 1);
  assert.equal(fsSync.existsSync(gate.resolveCapsulePaths(request).root), false);
}

async function explicitFallback(root) {
  const error = Object.assign(new Error('stderr failed after confirmed close'), {
    code: 'CAPSULE_BOOTSTRAP_IO_ERROR'
  });
  const boundary = failureBoundary(error);
  const service = loadService(boundary);
  const result = await service.provision(input(root, 'explicit'));
  assert.equal(result.bootstrapMode, 'synthetic');
  assert.equal(result.fallbackReason, error.message);
  assert.equal(boundary.calls, 1);
  assert.equal(fsSync.existsSync(path.join(result.root, 'possibly-live.txt')), false);
  assert.equal(fsSync.existsSync(result.genomePath), true);
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capsule-cleanup-'));
  try {
    await fs.mkdir(path.join(root, 'workspace'));
    await unconfirmed(root);
    await noImplicitFallback(root);
    await explicitFallback(root);
    console.log('Capsule cleanup: unconfirmed stop retained, retry refused, fallback explicit only: PASS');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
