'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { seed } = require('../../backend/tests/test_bounded_worker_delegation');
const { getDatabase } = require('../../backend/src/db');
const contract = require('./contract.cjs');
const lifecycle = require('./environment.cjs');

async function prepare(directory) {
  Object.assign(process.env, lifecycle.environment(directory));
  const workspace = path.join(directory, 'inputs');
  await fs.mkdir(workspace, { recursive: true });
  await fs.writeFile(path.join(workspace, 'task.txt'), 'Compute the registered native subset sum with independent evidence.');
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try { await seed(db, workspace); } finally { await lifecycle.close(db); }
}

async function execute(requestPath) {
  const directory = path.dirname(requestPath);
  const request = JSON.parse(await fs.readFile(requestPath, 'utf8'));
  const manifest = contract.validateManifest(JSON.parse(await fs.readFile(request.manifestPath, 'utf8')));
  assert.equal(contract.digest(manifest), request.manifestHash);
  const item = manifest.cases.find((entry) => entry.caseId === request.caseId);
  assert.ok(item && contract.CONDITIONS.includes(request.condition));
  const initialDatabaseHash = contract.hash(await fs.readFile(path.join(directory, 'mission.sqlite')));
  const inputFileHash = contract.hash(await fs.readFile(path.join(request.baseDirectory, 'inputs/task.txt')));
  assert.equal(initialDatabaseHash, item.initialDatabaseHash);
  assert.equal(inputFileHash, item.inputFileHash);
  Object.assign(process.env, lifecycle.environment(directory), { GENOS_AGOW_MODE: request.condition });
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try {
    assert.equal(require('../../backend/src/services/globalWorkspaceService').getMode(), request.condition);
    const dispatched = await require('../../backend/src/services/agents/subOrchestratorDispatchService')
      .dispatchSubOrchestratorWorker(db, 'delegation-sub', {
        mission: contract.mission(request), workerKind: 'bounded_worker',
        methodContract: contract.method(item), timeoutMs: 60000 });
    const run = await db.get('SELECT id FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1',
      dispatched.childAgentId);
    assert.ok(run, JSON.stringify(dispatched));
    const evidence = await require('./evidence.cjs').read(db, { ...request,
      runId: run.id, agentId: dispatched.childAgentId });
    const result = { ...request, ...evidence, initialDatabaseHash, inputFileHash, processId: process.pid };
    delete result.baseDirectory;
    delete result.manifestPath;
    contract.validateArm(manifest, result);
    await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  } finally { await lifecycle.close(db); }
}

async function main() {
  if (process.argv[2] === 'prepare') return prepare(path.resolve(process.argv[3]));
  assert.equal(process.argv[2], 'execute');
  return execute(path.resolve(process.argv[3]));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
