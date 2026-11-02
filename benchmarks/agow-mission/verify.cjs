'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { open } = require('../../backend/node_modules/sqlite');
const sqlite3 = require('../../backend/node_modules/sqlite3');
const { digest } = require('../../backend/src/services/evidenceProtocol/canonical');
const { execute } = require('./process.cjs');
const workspace = require('../../backend/src/services/globalWorkspaceService');
const contract = require('../../backend/src/services/agow/missionObservationContract');

async function verify(directory) {
  const root = path.resolve(__dirname, '../..');
  const archive = await fs.realpath(directory);
  const outputRoot = await fs.realpath(process.env.GENOS_AGOW_DEMO_ROOT
    || path.join(root, '.genos-agent-worlds/agow-mission-observation'));
  const relative = path.relative(outputRoot, archive);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Archive must be inside the demo output root.');
  const manifest = JSON.parse(await fs.readFile(path.join(archive, 'manifest.json'), 'utf8'));
  const report = JSON.parse(await fs.readFile(path.join(archive, 'report.json'), 'utf8'));
  assert.equal(report.manifestHash, digest(manifest));
  assert.deepEqual(Object.keys(manifest.sources).sort(), [...require('./run.cjs').SOURCES].sort());
  for (const [file, expected] of Object.entries(manifest.sources)) {
    assert.ok(require('./run.cjs').SOURCES.includes(file), 'Unexpected source path.');
    assert.equal(digest(await fs.readFile(path.join(root, file), 'utf8')), expected, `Source drift: ${file}`);
  }
  const db = await open({ filename: path.join(archive, 'receipts.sqlite'), driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  try {
    assert.deepEqual(report.results.map((item) => item.label), manifest.protocol.conditions);
    for (const result of report.results) await verifyResult(db, result, manifest);
    assert.deepEqual(report.results.map((item) => item.taskSucceeded), [true, false]);
    assert.equal(report.promotionAllowed, false);
    return { verified: true, missions: report.results.length, promotionAllowed: false };
  } finally { await db.close(); }
}

async function verifyResult(db, result, manifest) {
  const { binding } = result.observation;
  const { bindingHash, ...boundFields } = binding;
  assert.equal(digest(boundFields), bindingHash);
  assert.equal(binding.missionId, result.label);
  const records = await workspace.listMissionObservations({ db, agentId: binding.agentId });
  const persisted = records.find((item) => item.binding.runId === binding.runId);
  assert.deepEqual(persisted, result.observation);
  assert.deepEqual(result.orders, manifest.orders);
  const identity = contract.eventIdentity(result.event, binding);
  assert.equal(identity.eventDigest, persisted.observation.eventDigest);
  assert.equal(persisted.status, 'verified');
  const oracle = await execute('oracle.cjs', { orders: manifest.orders, answer: result.answer,
    bindingHash: binding.bindingHash, eventDigest: identity.eventDigest, outputDigest: result.event.payload.outputDigest });
  const measured = contract.measurement(oracle, { binding, eventIdentity: identity });
  assert.equal(digest(measured), persisted.observation.measurementHash);
  assert.equal(result.taskSucceeded, measured.metrics.realizedLoss === 0);
  assert.equal(persisted.observation.predictionError, measured.metrics.realizedLoss - binding.predictedLoss);
  assert.equal(persisted.policyUpdated, false);
  assert.equal(persisted.promotionAllowed, false);
}

if (require.main === module) verify(process.argv[2]).then((result) => console.log(JSON.stringify(result)))
  .catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { verify };
