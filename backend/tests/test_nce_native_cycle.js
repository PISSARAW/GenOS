'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { fixture } = require('./nce_native_fixture');
const { generateSplit } = require('../src/services/nceEnvironmentFactory');
const { runCausalCycle } = require('../src/services/nceCausalCycleService');
const { executeLearnedProcedure } = require('../src/services/nceProcedureExecutor');
const { program } = require('../src/services/nceProcedureProgram');
const phenotype = require('../src/services/phenotypicDevelopmentService');

async function assertLearning(ctx) {
  const split = await generateSplit({ ...ctx, family: 'unique-ascending', seed: 41, count: 1 });
  const input = { agentId: 'teacher', runId: 'learn-1', split };
  const result = await runCausalCycle(input, ctx.db);
  assert.equal(result.measured, true, JSON.stringify(result));
  assert.equal(result.promoted, true);
  assert.equal(result.delta, 1);
  assert.deepEqual(result.procedure.steps, ['unique', 'sort']);
  assert.ok(result.after.executionEvidence.every((item) => item.verification?.snapshotHash));
  const replay = await runCausalCycle(input, ctx.db);
  assert.equal(replay.replayed, true);
  assert.equal(replay.evidenceRef, result.evidenceRef);
  await assert.rejects(runCausalCycle({ ...input, features: { play: false } }, ctx.db), /runId reused/);
  return result;
}

async function assertTeaching(ctx, learned) {
  const split = await generateSplit({ ...ctx, family: 'unique-ascending', seed: 83, count: 1 });
  const receipt = await runCausalCycle({ agentId: 'student', runId: 'teaching-1', split,
    features: { play: false }, artifacts: [learned.artifact] }, ctx.db);
  assert.equal(receipt.promoted, true);
  assert.equal(receipt.artifact.agentId, 'teacher');
  assert.equal(receipt.transmittedArtifact.agentId, 'student');
  assert.deepEqual(receipt.transmittedArtifact.lineage, ['teacher', 'student']);
  assert.notDeepEqual(receipt.phenotypeBefore, receipt.phenotypeAfter);
  const state = await phenotype.loadPhenotypeState(null, ctx.db, 'student');
  assert.equal(state.creativeVector.known[0], true);
  assert.equal(state.creativeVector.known[7], false);
  await ctx.db.close();
  ctx.db = await open({ filename: ctx.filename, driver: sqlite3.Database });
  const restored = await phenotype.loadPhenotypeState(null, ctx.db, 'student');
  const execution = await executeLearnedProcedure(ctx.db, { agentId: 'student', values: [9, 2, 9, -4] });
  assert.deepEqual(execution.output, [-4, 2, 9]);
  assert.equal(execution.learnedFrom, receipt.evidenceRef);
  await assert.rejects(executeLearnedProcedure(ctx.db, { agentId: 'stranger', values: [1] }), /No learned/);
  assert.equal(restored.nceReceipts[0].evidenceRef, receipt.evidenceRef);
  assert.equal(Object.keys(restored.proceduralRepertoire).length, 1);
  assert.equal(Object.values(restored.culturalTraditions)[0].artifact.agentId, 'student');
  const revision = restored.revision;
  const stale = structuredClone(restored);
  await phenotype.savePhenotypeState(restored, ctx.db);
  await assert.rejects(phenotype.savePhenotypeState(stale, ctx.db), /revision conflict/);
  assert.equal(stale.revision, revision);
}

async function assertControls(ctx) {
  const split = await generateSplit({ ...ctx, family: 'ascending', seed: 91, count: 1 });
  const wrong = { id: 'wrong', agentId: 'teacher', provenance: { createdBy: 'teacher' },
    content: { procedure: program(['reverse']) } };
  const result = await runCausalCycle({ agentId: 'control', runId: 'control-1', split,
    features: { play: false }, artifacts: [wrong] }, ctx.db);
  assert.equal(result.delta, 0);
  assert.equal(result.promoted, false);
  const state = await phenotype.loadPhenotypeState(null, ctx.db, 'control');
  assert.equal(state.learnedProcedure, undefined);
  assert.equal(state.nceReceipts.length, 1, 'negative evidence is durable');
  await assert.rejects(runCausalCycle({ agentId: 'bad', runId: 'overlap',
    split: { training: split.training, heldOut: split.training } }, ctx.db), /disjoint|unique/);
}

async function main() {
  const ctx = await fixture();
  try {
    const learned = await assertLearning(ctx);
    await assertTeaching(ctx, learned);
    await assertControls(ctx);
    console.log('NCE native processes, protected verifiers, cultural transfer, restart and negative controls: PASS');
  } finally {
    await ctx.db.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
