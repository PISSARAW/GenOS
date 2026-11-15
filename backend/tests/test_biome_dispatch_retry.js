'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'biome-dispatch-retry-test-secret';

const assert = require('node:assert/strict');
const biome = require('../src/services/biomeCoordinationService');
const workers = require('../src/services/topology/topologyResultAppliers/biomeWorkerEvidence.cjs');
const applier = require('../src/services/topology/topologyResultAppliers/biome.cjs');

const missionId = 'mission-biome-oracle-retry';
const evidenceRefs = [`sha256:${'a'.repeat(64)}`, `sha256:${'b'.repeat(64)}`];
const records = evidenceRefs.map((reference, index) => ({
  reference, role: `role-${index}`, binding: { workerId: `worker-${index}` }, receipt: { runId: `run-${index}` }
}));
const members = records.map((record, index) => ({
  workerId: record.binding.workerId, role: record.role, status: 'completed', executionRunId: `run-${index}`
}));

function input(runtime) {
  return { db: {}, context: { missionId }, topology: { sessionId: runtime.sessionId },
    composition: { members }, accepted: members };
}

function blockedRuntime(goal) {
  return {
    sessionId: 'blocked-session', tick: 2, stopCondition: null,
    state: { goalVerification: goal }, ecology: {}, options: {}, verificationCount: 0,
    async step() { this.verificationCount += 1; throw new Error('Blocked session advanced'); }
  };
}

async function oracleRefusalCanResume() {
  const runtime = await biome.BiomeRuntime.create('Retry a refused dispatch oracle', {
    variant: 'resource', maxTicks: 10
  });
  let loadCount = 0;
  workers.load = async () => (++loadCount === 2 ? null : records);
  biome.BiomeRuntime.restore = async () => runtime;

  const refused = await applier.apply(input(runtime));
  assert.equal(refused.reason, 'BIOME_GOAL_ORACLE_UNVERIFIED');
  assert.equal(runtime.tick, 2);
  assert.equal(runtime.state.goalVerification.verified, false);
  const populationCount = runtime.ecology.populations.length;

  const resumed = await applier.apply(input(runtime));
  assert.equal(resumed.applied, true, JSON.stringify(resumed));
  assert.equal(resumed.tick, 3);
  assert.equal(runtime.ecology.populations.length, populationCount, 'Retry must not colonize the session twice.');
  assert.equal(loadCount, 4, 'Worker evidence must be reloaded before and during retry.');
}

async function unrelatedAdvancedSessionRemainsBlocked() {
  const runtime = blockedRuntime({ verified: false, tick: 2, sessionId: 'blocked-session',
    missionId: 'foreign-mission', producerId: 'foreign-mission', evidenceRefs });
  workers.load = async () => records;
  biome.BiomeRuntime.restore = async () => runtime;
  const result = await applier.apply(input(runtime));
  assert.equal(result.reason, 'BIOME_DISPATCH_SESSION_ALREADY_ADVANCED');
  assert.equal(runtime.verificationCount, 0);
}

async function alteredEvidenceRemainsBlocked() {
  const runtime = blockedRuntime({ verified: false, tick: 2, sessionId: 'blocked-session',
    missionId, producerId: missionId, evidenceRefs: ['sha256:stale'] });
  workers.load = async () => records;
  biome.BiomeRuntime.restore = async () => runtime;
  const result = await applier.apply(input(runtime));
  assert.equal(result.reason, 'BIOME_DISPATCH_SESSION_ALREADY_ADVANCED');
  assert.equal(runtime.verificationCount, 0);
}

async function staleRefusalRemainsBlocked() {
  const runtime = blockedRuntime({ verified: false, tick: 1, sessionId: 'blocked-session',
    missionId, producerId: missionId, evidenceRefs });
  workers.load = async () => records;
  biome.BiomeRuntime.restore = async () => runtime;
  const result = await applier.apply(input(runtime));
  assert.equal(result.reason, 'BIOME_DISPATCH_SESSION_ALREADY_ADVANCED');
  assert.equal(runtime.verificationCount, 0);
}

async function main() {
  const originalWorkers = { load: workers.load, individual: workers.individual,
    opportunity: workers.opportunity, measurements: workers.measurements };
  const originalRestore = biome.BiomeRuntime.restore;
  workers.individual = record => ({ individualId: record.binding.workerId, role: record.role,
    capabilities: [`capability:${record.binding.workerId}`], cognitiveRecipe: {}, phenotype: { focus: record.role } });
  workers.opportunity = record => ({ id: record.binding.workerId, descriptor: record.role,
    opportunityScore: 1, evidenceRefs: [record.reference],
    requiredCapabilities: [`capability:${record.binding.workerId}`] });
  workers.measurements = (items, ecology) => ({ populationCommands: [],
    populationResults: items.map(record => ({ id: record.receipt.runId,
      individualId: record.binding.workerId,
      populationId: ecology.populations.find(population => population.individuals
        .some(individual => individual.individualId === record.binding.workerId)).populationId,
      productivity: 1, evidenceRefs: [record.reference], artifact: {} })) });
  try {
    await oracleRefusalCanResume();
    await unrelatedAdvancedSessionRemainsBlocked();
    await alteredEvidenceRemainsBlocked();
    await staleRefusalRemainsBlocked();
  } finally {
    Object.assign(workers, originalWorkers);
    biome.BiomeRuntime.restore = originalRestore;
  }
  console.log('Biome oracle refusal retry remains bound to mission and verified worker evidence: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
