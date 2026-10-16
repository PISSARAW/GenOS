'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID, generateKeyPairSync, sign } = require('node:crypto');
const { digestStimulus, serializeSignal } = require('../src/services/syntheticSensoryIngestionService');

async function run() {
  const binary = process.env.GENOS_TEST_BINARY;
  assert.ok(binary, 'Set GENOS_TEST_BINARY to a precompiled genos executable.');
  assert.ok((await fs.stat(binary)).isFile(), `GENOS_TEST_BINARY is not a file: ${binary}`);

  const directory = await fs.mkdtemp(path.join(__dirname, '.sensory-trust-rotation-e2e-'));
  const workspace = path.join(directory, 'workspace');
  await fs.mkdir(workspace);
  const producerA = createProducer();
  const producerB = createProducer();
  const missionA = randomUUID();
  const missionB = randomUUID();
  const overlapTrust = trustJson([producerA, producerB]);
  const bOnlyTrust = trustJson([producerB]);
  const inputA = await writeInput({ directory, producer: producerA, mission: missionA, tick: 1 });
  const inputBOverlap = await writeInput({ directory, producer: producerB, mission: missionB, tick: 1 });

  runIngest({ binary, workspace, mission: missionA, trust: overlapTrust, replayKey: 'a-overlap', input: inputA }, true);
  const overlapBReceipt = runIngest({ binary, workspace, mission: missionB, trust: overlapTrust,
    replayKey: 'b-overlap', input: inputBOverlap }, true);

  const journalA = journalPath(workspace, missionA);
  const beforeRevocationAttempt = await fs.readFile(journalA);
  const inputARetired = await writeInput({ directory, producer: producerA, mission: missionA, tick: 2 });
  runIngest({ binary, workspace, mission: missionA, trust: bOnlyTrust,
    replayKey: 'a-after-retirement', input: inputARetired }, false, /not host-trusted/i);
  assert.deepEqual(await fs.readFile(journalA), beforeRevocationAttempt,
    'retired A must be refused before mutating its durable journal');

  const inputBAfterRotation = await writeInput({ directory, producer: producerB, mission: missionB, tick: 2 });
  const bReceipt = runIngest({ binary, workspace, mission: missionB, trust: bOnlyTrust,
    replayKey: 'b-after-rotation', input: inputBAfterRotation }, true);
  const persistedB = await readJournalReceipts(journalPath(workspace, missionB));
  assert.deepEqual(persistedB.map(receipt => receipt.event_id), [overlapBReceipt.event_id, bReceipt.event_id]);
  assert.ok(persistedB.every(receipt => receipt.source_receipt.producer_id === producerB.id));
  console.log('Synthetic sensory producer rotation A/B, retired-source refusal and durable B receipts: PASS');
  console.log(`Fixture retained for inspection: ${directory}`);
}

function createProducer() {
  const pair = generateKeyPairSync('ed25519');
  const publicDer = pair.publicKey.export({ type: 'spki', format: 'der' });
  return { id: randomUUID(), privateKey: pair.privateKey,
    publicHex: publicDer.subarray(publicDer.length - 32).toString('hex') };
}

function trustJson(producers) {
  return JSON.stringify({ schema: 'genos.synthetic-sensory-producer-trust/v1',
    producers: producers.map(producer => ({ producer_id: producer.id, public_key_hex: producer.publicHex })) });
}

async function writeInput(context) {
  const { directory, producer, mission, tick } = context;
  const signal = {
    sensor: 'vomeronasal',
    signal: {
      source_agent: 'synthetic-source', locus: 'test/sensor', pheromone_type: 'Alarm',
      concentration: 0.9, half_life_secs: 60, timestamp_epoch_ms: tick, subliminal_payload: {}
    }
  };
  const stimulusSha256 = digestStimulus(producer.id, tick, serializeSignal(signal));
  const claims = JSON.stringify({ schema: 'genos.synthetic-sensory-claims/v1', missionId: mission,
    tick, producerId: producer.id, stimulusSha256 });
  const input = { schema: 'genos.signed-synthetic-sensory-input/v1', producer_id: producer.id,
    signature_hex: sign(null, Buffer.from(claims), producer.privateKey).toString('hex'), tick, signal };
  const inputPath = path.join(directory, `${producer.id}-${tick}.json`);
  await fs.writeFile(inputPath, JSON.stringify(input));
  return inputPath;
}

function runIngest(input, expectedSuccess, errorPattern) {
  const result = spawn(input, ['sensory-ingest', '--mission-id', input.mission,
    '--replay-key', input.replayKey, '--experimental', '--input', input.input]);
  assert.equal(result.status === 0, expectedSuccess, result.stderr || result.stdout);
  if (errorPattern) assert.match(result.stderr, errorPattern);
  if (!expectedSuccess) return null;
  return JSON.parse(result.stdout);
}

function spawn(input, args) {
  const result = spawnSync(input.binary, args, { cwd: input.workspace, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, GENOS_STUDIO_ROOT: input.workspace, GENOS_SENSORY_TRUST_JSON: input.trust },
    maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  return result;
}

function journalPath(workspace, mission) {
  return path.join(workspace, 'biological-receipts', `${mission}.jsonl`);
}

async function readJournalReceipts(file) {
  const contents = await fs.readFile(file, 'utf8');
  return contents.split(/\r?\n/).filter(Boolean)
    .flatMap(line => JSON.parse(line).receipts || []);
}

run().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
