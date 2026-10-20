'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const service = require('../src/services/holobionte/runtime/holobiontMissionService');
const { mission } = require('./helpers/holobiontMissionFixtures');
const { isolationProof, withIsolationEvidence } = require('./helpers/holobiontIsolationProof');

function trialWithoutIsolation() {
  return { result: { sum: 6 }, contributionScore: 0.9, contractCompliant: true,
    resourcesConsumed: { tokens: 1 }, riskScore: 0 };
}

async function missingProofIsRejected(db) {
  await assert.rejects(() => service.runHolobiontMission(db, mission({
    trialCapabilityExecutor: async () => trialWithoutIsolation()
  })), { code: 'HOLOBIONT_ISOLATION_UNVERIFIED' });
}

async function mismatchedAdapterProofIsRejected(db) {
  const trialCapabilityExecutor = async ({ adapterProvenance }) => ({
    ...trialWithoutIsolation(),
    isolationProof: { ...isolationProof(adapterProvenance, 'forged-adapter-binding'),
      adapterProofHash: `sha256:${'f'.repeat(64)}` }
  });
  const verifyCapability = ({ resultHash, output }) => ({ status: 'VERIFIED', resultHash,
    verifierId: 'independent-isolation-checker',
    evidenceRefs: withIsolationEvidence(output, [`math-proof:${resultHash}`]) });
  await assert.rejects(() => service.runHolobiontMission(db, mission({
    trialCapabilityExecutor, verifyCapability
  })), { code: 'HOLOBIONT_ISOLATION_UNVERIFIED' });
}

async function boundProofIsPersisted(db) {
  const result = await service.runHolobiontMission(db, mission());
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.admissions[0].decision, 'ADMITTED');
  const receipt = result.admissions[0].receipt;
  assert.equal(receipt.isolationProof.schema, 'genos.holobiont-isolation-proof/v1');
  assert.equal(receipt.isolationProof.adapterProofHash,
    receipt.adapterProvenance.producer.proofHash);
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await missingProofIsRejected(db);
    await mismatchedAdapterProofIsRejected(db);
    await boundProofIsPersisted(db);
  } finally {
    await db.close();
  }
  console.log('Holobiont isolation contract: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
