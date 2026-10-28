'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const runner = require('../src/services/gvxDockerEvaluatorRunner');

const IMAGE = `registry.example.test/genos/evaluator@sha256:${'a'.repeat(64)}`;
const SUITE_HASH = 'b'.repeat(64);

function request(root) {
  return { image: IMAGE, command: ['python', '-m', 'evaluator'], suiteHash: SUITE_HASH,
    candidateDirectory: path.join(root, 'candidate'), outputDirectory: path.join(root, 'output'),
    limits: { timeoutMs: 5000, memoryBytes: 268435456, processCount: 32, cpuCount: 2 } };
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gvx-evaluator-test-'));
  await fs.mkdir(path.join(root, 'candidate'));
  await fs.writeFile(path.join(root, 'candidate', 'solution.py'), 'def answer(): return 42\n');
  return root;
}

function fakeDocker(options = {}) {
  const calls = [];
  const fakeSpawn = (program, args, spawnOptions) => {
    calls.push({ program, args, spawnOptions });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {
      if ((options.timeout || options.overflow) && args[0] === 'run') {
        setImmediate(() => child.emit('close', 137, null));
      }
      return true;
    };
    if (options.overflow && args[0] === 'run') {
      setImmediate(() => child.stdout.emit('data', Buffer.alloc(1024 * 1024 + 1)));
    } else if (args[0] !== 'run' || !options.timeout) {
      setImmediate(async () => {
        if (args[0] === 'run') {
          const report = options.report || { schema: runner.AGGREGATE_SCHEMA, suiteHash: SUITE_HASH,
            total: 10, passed: 8, failed: 1, errors: 1 };
          await fs.writeFile(path.join(mountSource(args, '/out'), 'aggregate.json'), JSON.stringify(report));
        }
        child.emit('close', 0, null);
      });
    }
    return child;
  };
  return { fakeSpawn, calls };
}

function mountSource(args, target) {
  const mount = args.filter((value, index) => args[index - 1] === '--mount')
    .find((value) => value.endsWith(`target=${target}`));
  const prefix = 'type=bind,source=';
  const end = mount.indexOf(`,target=${target}`);
  return mount.slice(prefix.length, end);
}

async function testSuccessfulRun() {
  const root = await fixture();
  const input = request(root);
  const fake = fakeDocker();
  const receipt = await runner.runAggregateEvaluator(input, { spawn: fake.fakeSpawn });
  const runCall = fake.calls[0];
  assert.equal(runCall.program, 'docker');
  for (const flag of ['--pull=never', '--network=none', '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true', '--pids-limit', '--memory', '--memory-swap', '--cpus', '--user']) {
    assert.ok(runCall.args.includes(flag), `missing Docker restriction ${flag}`);
  }
  assert.ok(runCall.args.includes(IMAGE));
  assert.ok(runCall.args.some((value) => value.includes('/candidate,readonly')));
  const evaluatorOutput = mountSource(runCall.args, '/out');
  assert.notEqual(evaluatorOutput, path.resolve(input.outputDirectory));
  assert.equal(path.basename(evaluatorOutput), 'evaluator-output');
  assert.equal(runCall.spawnOptions.shell, false);
  assert.equal(Object.keys(runCall.spawnOptions.env).some((key) => /TOKEN|SECRET|KEY/i.test(key)), false);
  assert.equal(receipt.total, 10);
  assert.equal(receipt.passRatePercent, 80);
  assert.equal(Object.hasOwn(receipt, 'cases'), false);
  const persisted = JSON.parse(await fs.readFile(path.join(input.outputDirectory, 'aggregate.json'), 'utf8'));
  assert.deepEqual(persisted, receipt);
  await fs.rm(root, { recursive: true, force: true });
}

async function testFailClosedInputs() {
  const root = await fixture();
  const input = request(root);
  const fake = fakeDocker();
  await assert.rejects(runner.runAggregateEvaluator({ ...input, image: 'latest' }, { spawn: fake.fakeSpawn }),
    { code: 'GVX_EVALUATOR_IMAGE_DIGEST_REQUIRED' });
  await assert.rejects(runner.runAggregateEvaluator({ ...input, command: ['python', '\0'] },
    { spawn: fake.fakeSpawn }), { code: 'GVX_EVALUATOR_COMMAND_INVALID' });
  assert.equal(runner.validateRequest({ ...input, dockerPath: 'powershell' }).dockerPath, 'docker');
  assert.equal(fake.calls.length, 0);
  await fs.rm(root, { recursive: true, force: true });
}

async function testAggregateSanitizationAndTimeout() {
  const root = await fixture();
  const badInput = request(root);
  const bad = fakeDocker({
    report: { schema: runner.AGGREGATE_SCHEMA, suiteHash: SUITE_HASH, total: 1,
      passed: 1, failed: 0, errors: 0, caseDetails: ['fixture-only private detail'] } });
  await assert.rejects(runner.runAggregateEvaluator(badInput, { spawn: bad.fakeSpawn }),
    { code: 'GVX_EVALUATOR_AGGREGATE_INVALID' });
  assert.deepEqual(await fs.readdir(badInput.outputDirectory), []);

  const timeoutInput = request(root);
  timeoutInput.limits.timeoutMs = 1000;
  const timeout = fakeDocker({ timeout: true });
  await assert.rejects(runner.runAggregateEvaluator(timeoutInput, { spawn: timeout.fakeSpawn }),
    { code: 'GVX_EVALUATOR_TIMEOUT' });
  assert.equal(timeout.calls.some((call) => call.args[0] === 'kill'), true);

  const overflowInput = request(root);
  const overflow = fakeDocker({ overflow: true });
  await assert.rejects(runner.runAggregateEvaluator(overflowInput, { spawn: overflow.fakeSpawn }),
    { code: 'GVX_EVALUATOR_OUTPUT_LIMIT_EXCEEDED' });
  assert.equal(overflow.calls.some((call) => call.args[0] === 'kill'), true);
  assert.deepEqual(await fs.readdir(overflowInput.outputDirectory), []);
  await fs.rm(root, { recursive: true, force: true });
}

async function main() {
  await testSuccessfulRun();
  await testFailClosedInputs();
  await testAggregateSanitizationAndTimeout();
  console.log('GVX Docker evaluator sandbox restrictions and aggregate-only receipts passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
