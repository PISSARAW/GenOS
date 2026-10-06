'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { compileRegistry } = require('../src/philosophy/implementationContracts');
const { CONCEPT_DEFINITIONS } = require('../src/philosophy/conceptDefinitions');
const { fixture } = require('../src/philosophy/contractExperiments');
const { referenceFor, OBSERVATION_FILE } = require('../src/services/ontogenesis/philosophicalMissionContract');
const { verifyPhilosophicalObservations, pointerValue } = require('../src/services/ontogenesis/philosophicalObservationService');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'philosophy-binding-'));
const contracts = compileRegistry(CONCEPT_DEFINITIONS).contracts;
const references = contracts.map(referenceFor);
const values = {};
const artifact = { missionId: 'bounded-audit', contractHashes: {}, bindings: {} };
for (const contract of contracts) {
  Object.assign(values, fixture(contract, 'satisfying'));
  artifact.contractHashes[contract.id] = referenceFor(contract).contractHash;
  artifact.bindings[contract.execution.field] = { file: 'evidence.json', pointer: '/' + contract.execution.field };
}

function writeArtifact(value) {
  fs.mkdirSync(path.join(root, '.genos'), { recursive: true });
  fs.writeFileSync(path.join(root, OBSERVATION_FILE), JSON.stringify(value));
}

try {
  const binding = { missionId: artifact.missionId, treeHash: 'a'.repeat(64) };
  assert.equal(verifyPhilosophicalObservations(root, []), null);
  assert.equal(verifyPhilosophicalObservations(root, references.map((reference) => ({ ...reference, requiredForMission: false }))), null);
  assert.throws(() => verifyPhilosophicalObservations(root, references, binding), /ENOENT/);
  fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify(values));
  writeArtifact(artifact);
  const receipt = verifyPhilosophicalObservations(root, references, binding);
  assert.equal(receipt.contracts.length, 375);
  assert.equal(receipt.missionId, artifact.missionId);
  assert.equal(receipt.sourceFactsVerified, false);
  assert.equal(receipt.independentValidation, false);
  assert.equal(receipt.promotionEligible, false);
  assert.equal(verifyPhilosophicalObservations(root, references, binding).receiptHash, receipt.receiptHash);
  assert.throws(() => verifyPhilosophicalObservations(root, references, { missionId: 'different' }), /autre-mission/);
  assert.throws(() => verifyPhilosophicalObservations(root, [{ ...references[0], contractHash: '0'.repeat(64) }], binding), /obsolete/);
  assert.throws(() => verifyPhilosophicalObservations(root, [references[0], references[0]], binding), /duplique/);
  const badArtifact = structuredClone(artifact);
  badArtifact.contractHashes[contracts[0].id] = '0'.repeat(64);
  writeArtifact(badArtifact);
  assert.throws(() => verifyPhilosophicalObservations(root, references, binding), /obsolete/);
  writeArtifact(artifact);
  fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify({ ...values, [contracts[0].execution.field]: '' }));
  assert.throws(() => verifyPhilosophicalObservations(root, references, binding), /audit-philosophique-rejete/);
  fs.writeFileSync(path.join(root, 'evidence.json'), JSON.stringify({ ...values, changed: true }));
  assert.notEqual(verifyPhilosophicalObservations(root, references, binding).receiptHash, receipt.receiptHash);
  const traversal = structuredClone(artifact);
  traversal.bindings[contracts[0].execution.field].file = '../outside.json';
  writeArtifact(traversal);
  assert.throws(() => verifyPhilosophicalObservations(root, references, binding));
  const secret = structuredClone(artifact);
  secret.bindings[contracts[0].execution.field].file = '.env.json';
  writeArtifact(secret);
  assert.throws(() => verifyPhilosophicalObservations(root, references, binding), /interdite/);
  assert.equal(pointerValue({ 'a/b': { '~key': false } }, '/a~1b/~0key'), false);
  assert.throws(() => pointerValue({}, '/__proto__'), /absente/);
  assert.throws(() => pointerValue({ a: 1 }, 'a'), /invalide/);
  assert.throws(() => pointerValue({ '~2': 1 }, '/~2'), /invalide/);
  const overQuota = structuredClone(artifact);
  for (const contract of contracts.slice(0, 32)) {
    const file = `source-${contract.id}.json`;
    fs.writeFileSync(path.join(root, file), JSON.stringify(values));
    overQuota.bindings[contract.execution.field].file = file;
  }
  overQuota.bindings[contracts[32].execution.field].file = 'never-created.json';
  writeArtifact(overQuota);
  assert.throws(() => verifyPhilosophicalObservations(root, references, binding), /budget-sources-philosophiques-depasse/,
    'the 33rd source must be refused before any filesystem read');
  console.log('375 observation bindings, source hashes, mission/revision confinement and fail-closed checks passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
