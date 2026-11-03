'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { fixture } = require('./nce_native_fixture');
const { generateSplit } = require('../src/services/nceEnvironmentFactory');
const { runCausalCycle } = require('../src/services/nceCausalCycleService');
const { environmentFingerprint } = require('../src/services/poetExecutionEvidence');
const { digest } = require('../src/services/nceProcedureProgram');
const phenotype = require('../src/services/phenotypicDevelopmentService');

async function legacyRequestHash(input) {
  const fingerprints = {
    training: await Promise.all(input.split.training.map(environmentFingerprint)),
    heldOut: await Promise.all(input.split.heldOut.map(environmentFingerprint)),
  };
  return digest({ agentId: input.agentId, features: input.features, artifacts: [], fingerprints, timeoutMs: 30000,
    contracts: [...input.split.training, ...input.split.heldOut].map((environment) => ({
      command: environment.verifierCommand, protectedPaths: environment.protectedPaths,
      artifactPath: environment.artifactPath })) });
}

async function main() {
  const ctx = await fixture();
  try {
    const split = await generateSplit({ ...ctx, family: 'ascending', seed: 7, count: 1 });
    const input = { agentId: 'legacy-agent', runId: 'archived-run', split,
      features: { play: false, culture: false, phenotype: false, poet: false } };
    const receipt = { schema: 'genos.nce.causal-cycle.v1', runId: input.runId, agentId: input.agentId,
      requestHash: await legacyRequestHash(input), evidenceRef: 'archived-contract-fixture',
      measured: false, promoted: false };
    await ctx.db.run('INSERT INTO agents (id) VALUES (?)', input.agentId);
    const state = { agentId: input.agentId, genomeId: 'legacy', currentPhenotype: {}, nceReceipts: [receipt] };
    await phenotype.savePhenotypeState(state, ctx.db);
    const replay = await runCausalCycle(input, ctx.db);
    assert.deepEqual(replay, { ...receipt, replayed: true });
    assert.deepEqual(await phenotype.loadPhenotypeState(null, ctx.db, input.agentId), state);
    await assert.rejects(runCausalCycle({ ...input, search: { maxCandidates: 16 } }, ctx.db), /runId reused/);
    console.log('NCE archived receipt fixture: legacy fingerprint replay without execution: PASS');
  } finally {
    await ctx.db.close();
    const root = await fs.realpath(ctx.root);
    assert.match(root, /[\\/]nce-native-[^\\/]+$/);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
