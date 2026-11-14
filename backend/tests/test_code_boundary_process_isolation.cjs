'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const policy = require('../src/services/codeBoundaryProcessIsolation');
const environment = require('../src/services/localCodeTestEnvironment');

function probeSource(outside) {
  return `'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),wt=require('node:worker_threads');
function denied(action){try{action();return false;}catch(error){return error.code==='ERR_ACCESS_DENIED';}}
const result={pid:process.pid,argv:process.execArgv,
  outsideReadDenied:denied(()=>fs.readFileSync(${JSON.stringify(outside)})),
  workspaceWriteDenied:denied(()=>fs.writeFileSync('forbidden.txt','x')),
  childDenied:denied(()=>cp.spawnSync(process.execPath,['-e',''])),
  workerDenied:denied(()=>new wt.Worker('0',{eval:true}))};
process.stdout.write(JSON.stringify(result));\n`;
}

function executeProbe(root, outside) {
  const generated = path.join(root, '.genos');
  fs.mkdirSync(generated, { recursive: true });
  fs.writeFileSync(path.join(generated, 'boundary-check.cjs'), probeSource(outside));
  const plan = policy.plan(policy.COMMAND, root);
  const env = { ...environment.build(os.tmpdir()), ...plan.environment, NODE_NO_WARNINGS: '1' };
  const result = spawnSync(plan.program, plan.args, { cwd: root, env, shell: plan.shell, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return { plan, observed: JSON.parse(result.stdout) };
}

async function timeoutProbe(root) {
  fs.writeFileSync(path.join(root, '.genos', 'boundary-check.cjs'), 'setInterval(()=>{},1000);\n');
  const previousMode = process.env.GENOS_TEST_MODE;
  const previousTimeout = process.env.GENOS_BOUNDARY_TEST_TIMEOUT_MS;
  process.env.GENOS_TEST_MODE = '1';
  process.env.GENOS_BOUNDARY_TEST_TIMEOUT_MS = '75';
  try {
    const result = await policy.run(policy.COMMAND, root, os.tmpdir());
    assert.equal(result.timedOut, true, 'the process deadline must terminate the runner');
    assert.equal(result.isolation.timeoutMs, 75);
  } finally {
    if (previousMode === undefined) delete process.env.GENOS_TEST_MODE;
    else process.env.GENOS_TEST_MODE = previousMode;
    if (previousTimeout === undefined) delete process.env.GENOS_BOUNDARY_TEST_TIMEOUT_MS;
    else process.env.GENOS_BOUNDARY_TEST_TIMEOUT_MS = previousTimeout;
  }
}

async function runnerProbe(root) {
  const runner = path.resolve(__dirname, '../src/services/codeBoundaryRunner.cjs');
  fs.copyFileSync(runner, path.join(root, '.genos', 'boundary-check.cjs'));
  fs.writeFileSync(path.join(root, 'module.cjs'), 'exports.sum=(a,b)=>a+b;\n');
  fs.writeFileSync(path.join(root, 'boundary-cases.json'), JSON.stringify({
    schema: 'genos.boundary-cases/v1', cases: [{ id: 'sum', steps: [
      { op: 'call', name: 'sum', args: [2, 3], expected: 5 }] }]
  }));
  fs.writeFileSync(path.join(root, '.genos', 'boundary-contract.json'), JSON.stringify({
    generatedTestPath: 'boundary-cases.json', sourcePaths: ['module.cjs'], api: {
      functions: ['sum'], constructors: {}, postconditions: {}, domains: {
        functions: { sum: ['integer', 'integer'] }, constructors: {}, methods: {} }
    }
  }));
  const execution = await policy.run(policy.COMMAND, root, os.tmpdir());
  assert.equal(execution.exitCode, 0, execution.stderr);
  const line = execution.stdout.split(/\r?\n/).find(item => item.startsWith('GENOS_BOUNDARY_RESULT:'));
  const result = JSON.parse(line.slice('GENOS_BOUNDARY_RESULT:'.length));
  assert.equal(result.status, 'passed');
  assert.notEqual(result.isolation.processId, process.pid);
  assert.equal(result.isolation.hostProcessId, process.pid);
  assert.equal(result.isolation.filesystem, 'workspace-read-only');
}

async function main() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-boundary-isolation-'));
  const root = path.join(parent, 'workspace');
  const outside = path.join(parent, 'outside-secret.txt');
  fs.mkdirSync(root);
  fs.writeFileSync(outside, 'secret');
  try {
    const { plan, observed } = executeProbe(root, outside);
    assert.equal(plan.program, process.execPath);
    assert.equal(plan.shell, false);
    assert.equal(plan.timeoutMs, policy.TIMEOUT_MS);
    assert.equal(plan.isolation.memoryMb, policy.MEMORY_MB);
    assert.equal(plan.isolation.stackKb, policy.STACK_KB);
    assert.notEqual(observed.pid, process.pid, 'the runner must execute in a distinct process');
    assert.equal(observed.outsideReadDenied, true, 'filesystem reads must stay inside the workspace');
    assert.equal(observed.workspaceWriteDenied, true, 'the runner filesystem must be read-only');
    assert.equal(observed.childDenied, true, 'the runner must not create child processes');
    assert.equal(observed.workerDenied, true, 'the runner must not create worker threads');
    assert.ok(observed.argv.includes(`--max-old-space-size=${policy.MEMORY_MB}`));
    assert.ok(observed.argv.includes(`--stack-size=${policy.STACK_KB}`));
    await runnerProbe(root);
    await timeoutProbe(root);
    console.log('Boundary runner process isolation and resource limits passed.');
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
