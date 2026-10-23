'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const execFileAsync = promisify(execFile);
const handoff = require('../src/services/aTeamWorkspaceHandoffService');

async function git(args, cwd) {
  return execFileAsync('git', args, { cwd, windowsHide: true });
}

async function write(root, relative, content) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

async function main() {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.genos-test-ateam-handoff-'));
  const capsuleRoot = path.join(root, '.genos-agent-worlds', 'workspace');
  const producerRoot = path.join(capsuleRoot, 'worker_producer');
  const consumerRoot = path.join(capsuleRoot, 'worker_consumer');
  try {
    await fs.mkdir(producerRoot, { recursive: true });
    await fs.mkdir(consumerRoot, { recursive: true });
    await write(producerRoot, 'src/site.js', 'module.exports = "fixed";\n');
    await write(producerRoot, 'test/site.test.js', 'assert.equal(require("../src/site"), "fixed");\n');
    await git(['init', '--quiet', '--initial-branch=quality'], producerRoot);
    await git(['config', 'user.name', 'GenOS test'], producerRoot);
    await git(['config', 'user.email', 'genos-test@local.invalid'], producerRoot);
    await git(['add', 'src/site.js', 'test/site.test.js'], producerRoot);
    await git(['commit', '--quiet', '-m', 'Fix site contract'], producerRoot);
    const { stdout: commit } = await git(['rev-parse', 'HEAD'], producerRoot);
    await write(consumerRoot, 'src/site.js', 'module.exports = "broken";\n');
    await write(consumerRoot, '.genos/runtime.json', '{"worker":"consumer"}');

    const byWorker = new Map([['producer', { workspaceRoot: producerRoot, workspaceBackend: 'physical' }]]);
    const result = await handoff.materializeHandoffs({
      consumer: { workspaceRoot: consumerRoot, workspaceBackend: 'physical' },
      byWorker,
      handoffs: [{ producer: { agentId: 'producer' }, artifactRefs: [`git:${commit.trim()}`] }]
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].commit, commit.trim());
    assert.equal((await fs.readFile(path.join(consumerRoot, 'src/site.js'), 'utf8')), 'module.exports = "fixed";\n');
    assert.equal((await fs.readFile(path.join(consumerRoot, 'test/site.test.js'), 'utf8')).includes('assert.equal'), true);
    assert.equal((await git(['rev-parse', 'HEAD'], consumerRoot)).stdout.trim(), commit.trim());
    assert.equal(await fs.readFile(path.join(consumerRoot, '.genos/runtime.json'), 'utf8'), '{"worker":"consumer"}');
    await write(consumerRoot, 'review.txt', 'review remains isolated');
    await git(['add', 'review.txt'], consumerRoot);
    await git(['config', 'user.name', 'GenOS test'], consumerRoot);
    await git(['config', 'user.email', 'genos-test@local.invalid'], consumerRoot);
    await git(['commit', '--quiet', '-m', 'Review handoff'], consumerRoot);
    assert.equal((await git(['rev-parse', 'HEAD'], producerRoot)).stdout.trim(), commit.trim());

    const pipelineConsumerRoot = path.join(capsuleRoot, 'worker_pipeline_consumer');
    await fs.mkdir(pipelineConsumerRoot, { recursive: true });
    const pipelineConsumer = { agentId: 'pipeline-consumer', workspaceRoot: pipelineConsumerRoot, workspaceBackend: 'physical' };
    const captured = [];
    const telemetry = require('../src/services/telemetryObserver');
    const emitEvent = telemetry.emitEvent;
    telemetry.emitEvent = (event) => { captured.push(event); return event; };
    try {
      const pipeline = require('../src/services/workerEvidenceBarrierPipeline');
      const receipts = await pipeline.materializeStageHandoff({ orchestratorId: 'orchestrator-test', stage: 1,
        workers: [{ agentId: 'producer', workspaceRoot: producerRoot, workspaceBackend: 'physical' }, pipelineConsumer] },
      pipelineConsumer, [{ producer: { agentId: 'producer' }, artifactRefs: ['git:' + commit.trim()] }]);
      assert.equal(receipts.length, 1);
      assert.equal((await fs.readFile(path.join(pipelineConsumerRoot, 'src/site.js'), 'utf8')), 'module.exports = "fixed";\n');
      assert.equal(captured.some((event) => event.eventType === 'ATEAM_STAGE_HANDOFF_MATERIALIZED'
        && event.payload.handoffs[0].commit === commit.trim()), true);
    } finally { telemetry.emitEvent = emitEvent; }

    await assert.rejects(() => handoff.materializeHandoffs({
      consumer: { workspaceRoot: consumerRoot, workspaceBackend: 'physical' }, byWorker,
      handoffs: [{ producer: { agentId: 'producer' }, artifactRefs: [`git:${commit.trim()}`, `git:${commit.trim()}`] }]
    }), { code: 'ATEAM_HANDOFF_MULTIPLE_COMMITS' });
    console.log('A-Team typed handoff materializes the exact producer commit into an isolated consumer capsule.');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
