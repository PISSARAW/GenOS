'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { fixture } = require('./nce_native_fixture');
const { generateSplit } = require('../src/services/nceEnvironmentFactory');
const { runCausalCycle } = require('../src/services/nceCausalCycleService');
const { executeLearnedProcedure } = require('../src/services/nceProcedureExecutor');
const { program, candidatePrograms, digest } = require('../src/services/nceProcedureProgram');
const phenotype = require('../src/services/phenotypicDevelopmentService');

async function learnParents(ctx) {
  for (const [family, steps] of [['unique-ascending', ['unique', 'sort']], ['descending', ['sort', 'reverse']]]) {
    const split = await generateSplit({ ...ctx, family, seed: 41, count: 1 });
    const receipt = await runCausalCycle({ agentId: 'composer', runId: `parent-${family}`, split,
      features: { play: false }, timeoutMs: 90000,
      artifacts: [{ id: family, agentId: 'teacher', provenance: { createdBy: 'teacher' },
        content: { procedure: program(steps) } }] }, ctx.db);
    assert.equal(receipt.promoted, true, JSON.stringify(receipt));
  }
  const state = await phenotype.loadPhenotypeState(null, ctx.db, 'composer');
  assert.equal(Object.keys(state.proceduralRepertoire).length, 2);
}

async function assertControls(ctx, input) {
  const disabled = await runCausalCycle({ ...input, runId: 'play-disabled', features: { play: false } }, ctx.db);
  assert.equal(disabled.promoted, false);
  assert.equal(disabled.search.candidates.length, 0);
  const zero = await runCausalCycle({ ...input, runId: 'zero-search', search: { maxCandidates: 0 } }, ctx.db);
  assert.equal(zero.measured, true);
  assert.equal(zero.promoted, false, 'fixed catalog cannot solve unique descending');
  assert.equal(zero.delta, 0);
  const state = await phenotype.loadPhenotypeState(null, ctx.db, 'composer');
  assert.deepEqual(state.learnedProcedure.steps, ['sort', 'reverse']);
  assert.equal(Object.keys(state.proceduralRepertoire).length, 2, 'proposals are not acquired');
}

async function assertComposition(ctx, input) {
  const receipt = await runCausalCycle(input, ctx.db);
  assert.equal(receipt.measured, true, JSON.stringify(receipt));
  assert.equal(receipt.promoted, true);
  assert.equal(receipt.delta, 1);
  assert.deepEqual(receipt.procedure.steps, ['unique', 'sort', 'sort', 'reverse']);
  assert.ok(!candidatePrograms().some((candidate) => digest(candidate) === digest(receipt.procedure)));
  const derivation = receipt.artifact.provenance.derivation;
  assert.equal(derivation.kind, 'composition');
  assert.equal(derivation.parents.length, 2);
  assert.deepEqual(receipt.transmittedArtifact.provenance.derivation, derivation);
  assert.ok(receipt.after.executionEvidence.every((item) => item.verification?.snapshotHash));
  const state = await phenotype.loadPhenotypeState(null, ctx.db, 'composer');
  assert.deepEqual(state.proceduralRepertoire[digest(receipt.procedure)].derivation, derivation);
  const replay = await runCausalCycle(input, ctx.db);
  assert.equal(replay.replayed, true, 'new repertoire must not change the original request');
  assert.equal(replay.evidenceRef, receipt.evidenceRef);
  assert.deepEqual(replay.search, receipt.search);
  await assert.rejects(runCausalCycle({ ...input, search: { maxCandidates: 0 } }, ctx.db), /runId reused/);
  return receipt;
}

async function assertTransferAndRestart(ctx, learned) {
  const split = await generateSplit({ ...ctx, family: 'unique-descending', seed: 83, count: 1 });
  const receipt = await runCausalCycle({ agentId: 'student', runId: 'composition-transfer', split,
    features: { play: false }, artifacts: [learned.transmittedArtifact], timeoutMs: 90000 }, ctx.db);
  assert.equal(receipt.promoted, true, JSON.stringify(receipt));
  assert.deepEqual(receipt.transmittedArtifact.lineage, ['composer', 'student']);
  assert.deepEqual(receipt.artifact.provenance.derivation, learned.artifact.provenance.derivation);
  await ctx.db.close();
  ctx.db = await open({ filename: ctx.filename, driver: sqlite3.Database });
  await ctx.db.exec('PRAGMA foreign_keys = ON');
  const restored = await phenotype.loadPhenotypeState(null, ctx.db, 'student');
  assert.deepEqual(restored.proceduralRepertoire[digest(receipt.procedure)].derivation,
    learned.artifact.provenance.derivation);
  const execution = await executeLearnedProcedure(ctx.db, { agentId: 'student', values: [4, -7, 4, 8, 8, 0] });
  assert.deepEqual(execution.output, [8, 4, 0, -7]);
  assert.equal(execution.learnedFrom, receipt.evidenceRef);
}

async function main() {
  const ctx = await fixture();
  try {
    await learnParents(ctx);
    const split = await generateSplit({ ...ctx, family: 'unique-descending', seed: 91, count: 1 });
    const input = { agentId: 'composer', runId: 'compose', split, search: { maxCandidates: 2 }, timeoutMs: 90000 };
    await assertControls(ctx, input);
    const receipt = await assertComposition(ctx, input);
    await assertTransferAndRestart(ctx, receipt);
    console.log('NCE novel composition, negative controls, replay, transfer and SQLite restart: PASS');
  } finally {
    await ctx.db.close();
    const root = await fs.realpath(ctx.root);
    assert.match(root, /[\\/]nce-native-[^\\/]+$/);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
