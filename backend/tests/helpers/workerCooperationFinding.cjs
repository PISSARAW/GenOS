'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const evidence = require('./workerCooperationLiveEvidence.cjs');

function assertOwner(binding, input) {
  assert.equal(binding?.missionId, input.missionId, 'Finding belongs to another mission.');
  assert.equal(binding?.workerId, input.workerId);
  assert.equal(binding?.parentWorkerId, input.missionId);
  assert.equal(binding?.genome.workerContract?.identity.workerKind, 'resident_daemon');
}

async function sourceFacts(context, contract) {
  require('../../src/services/epistemic/workspaceVerificationContract').assertContract(contract);
  assert.equal(contract.kind, 'resource_allocation');
  assert.equal(contract.mode, 'observation');
  const contents = {};
  for (const file of ['problem.json', 'allocation.json']) {
    const source = contract.sources.find(item => item.path === file);
    assert.ok(source && !source.mutable, 'Finding requires immutable allocation sources.');
    const bytes = await fs.readFile(path.join(context.workspace, file));
    assert.equal(evidence.hash(bytes), source.sha256, 'Source changed after daemon observation.');
    contents[file] = JSON.parse(bytes.toString('utf8'));
  }
  return { problem: contents['problem.json'], allocation: contents['allocation.json'] };
}

async function read(context, stage) {
  const store = require('../../src/services/biologicalWorkerStore');
  const binding = await store.binding(context.db, stage.runId);
  assertOwner(binding, { missionId: context.id, workerId: stage.workerId });
  const receipt = await store.receipt(context.db, stage.runId);
  assert.equal(receipt?.result.verified, true, 'Planner requires a persisted semantic daemon receipt.');
  const observations = await store.observations(context.db, stage.runId);
  const terminal = observations.filter(item => item.applied && item.event.eventType === 'AGENT_COMPLETED').at(-1);
  const payload = terminal?.event.payload;
  assert.equal(await require('../../src/services/missionDossierOracleVerification').trustedEvent({
    db: context.db, missionId: context.id, workerId: stage.workerId, event: payload }), true,
  'Finding must have an independent native oracle in this mission.');
  const observation = evidence.claim({ report: payload.evidenceReport });
  assert.equal(typeof observation.anomaly, 'boolean');
  const contract = binding.genome.workerContract.assignment.workspaceVerificationContract;
  const facts = await sourceFacts(context, contract);
  return { schema: 'genos.worker-cooperation-finding/v1', missionId: context.id,
    runId: stage.runId, workerId: stage.workerId, receiptId: receipt.receiptId,
    evidenceHash: receipt.evidence.hash, oracleHash: receipt.semanticVerification.hash,
    sourceRefs: contract.sources.map(source => `sha256:${source.sha256}`), observation, facts };
}

module.exports = { read, assertOwner, sourceFacts };
