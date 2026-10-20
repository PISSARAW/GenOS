'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const detachedSpawn = require('../bin/detachedSpawn.cjs');

async function tick() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function main() {
  const originalSpawn = childProcess.spawn;
  const originalOpen = detachedSpawn.openRunnerStdio;
  const originalArgs = detachedSpawn.toSpawnArgs;
  const child = new EventEmitter();
  const writes = [];
  let spawnOptions;
  let closedLog = 0;

  childProcess.spawn = (_command, _args, options) => {
    spawnOptions = options;
    return child;
  };
  detachedSpawn.openRunnerStdio = () => ({
    stdio: ['ignore', 'ignore', 'ignore'],
    close: () => { closedLog += 1; }
  });
  detachedSpawn.toSpawnArgs = () => ['--payload-file', 'fixture.json'];

  try {
    const launcher = require('../src/services/topology/workerLauncher.cjs');
    let settled = false;
    const promise = launcher.spawnTopologyWorker({
      db: { run: async (...args) => writes.push(args) },
      context: {
        bridgePath: 'bridge.cjs', repoRoot: process.cwd(), orchestratorId: 'orchestrator-1',
        missionId: 'mission-1', request: { mode: 'biocenose' }
      },
      member: { role: 'independent_reviewer', mission: 'Review the candidate.' },
      parent: {}, workerId: 'worker-1',
      launchCaps: { capabilities: [], capabilityManifest: null, toolLease: [] }
    }).then(() => { settled = true; });

    await tick();
    child.emit('spawn');
    await tick();
    assert.equal(settled, false, 'the launcher must not resolve when the process only started');
    assert.equal(spawnOptions.detached, false, 'topology workers must remain attached');
    assert.deepEqual(spawnOptions.stdio, ['ignore', 'ignore', 'ignore']);

    child.emit('close', 0);
    await promise;
    assert.equal(settled, true, 'the launcher resolves only after the worker closes successfully');
    assert.equal(closedLog, 1, 'the inherited log descriptor closes after spawn');
    assert.deepEqual(writes, [], 'a successful worker exit must not write an error status');
  } finally {
    childProcess.spawn = originalSpawn;
    detachedSpawn.openRunnerStdio = originalOpen;
    detachedSpawn.toSpawnArgs = originalArgs;
  }

  console.log('Topology worker wait contract: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
