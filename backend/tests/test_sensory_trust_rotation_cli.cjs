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
  const inputA = await writeInput(directory, producerA, missionA, 1);
  const inputBOverlap = await writeInput(directory, producerB, missionB, 1);

  runIngest({ binary, workspace, mission: missionA, trust: overlapTrust, replayKey: 'a-overlap', input: inputA }, true);
  const overlapBReceipt = runIngest({ binary, workspace, mission: missionB, trust: overlapTrust,
    replayKey: 'b-overlap', input: inputBOverlap }, true);

  const journalA = journalPath(workspace, missionA);
  const beforeRevocationAttempt = await fs.readFile(journalA);
  const inputARetired = await writeInput(directory, producerA, missionA, 2);
  runIngest({ binary, workspace, mission: missionA, trust: bOnlyTrust,
    replayKey: 'a-after-retirement', input: inputARetired }, false, /not host-trusted/i);
  assert.deepEqual(await fs.readFile(journalA), beforeRevocationAttempt,
    'retired A must be refused before mutating its durable journal');

  const inputBAfterRotation = await writeInput(directory, producerB, missionB, 2);
  const bReceipt = runIngest({ binary, workspace, mission: missionB, trust: bOnlyTrust,
    replayKey: 'b-after-rotation', input: inputBAfterRotation }, true);

  // Each spawnSync is a fresh CLI process; B's post-rotation input is consumed on the second tick.
  const activeB = { binary, workspace, mission: missionB, trust: bOnlyTrust };
  const firstTick = runTick(activeB, true);
  assert.equal(firstTick.tick, 1);
  const afterFirst = await readReceipts(workspace, missionB);
  assert.deepEqual(sourceEvents(afterFirst), [overlapBReceipt.event_id]);

  const restartedTick = runTick(activeB, true);
  assert.equal(restartedTick.tick, 2);
  const afterRestart = await readReceipts(workspace, missionB);
  assert.deepEqual(sourceEvents(afterRestart), [overlapBReceipt.event_id, bReceipt.event_id]);
  const consumedB = pafReceipts(afterRestart).find(receipt => receipt.tick === 2);
  assert.equal(consumedB.sensory_source_refs[0].source_digest, bReceipt.source_digest);

  const finalTick = runTick(activeB, true);
  assert.equal(finalTick.tick, 3);
  const afterFinal = await readReceipts(workspace, missionB);
  const thirdPaf = pafReceipts(afterFinal).find(receipt => receipt.tick === 3);
  assert.deepEqual(thirdPaf.sensory_source_refs, [], 'B input is consumed exactly once');
  assert.equal(sourceEvents(afterFinal).filter(eventId => eventId === bReceipt.event_id).length, 1);
  console.log('Synthetic sensory producer rotation A/B, revocation, restart consumption and single-use: PASS');
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

async function writeInput(directory, producer, mission, tick) {
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

function runTick(input, expectedSuccess) {
  const result = spawn(input, ['biological', '--tick', '--mission-id', input.mission,
    '--mission', 'sensory-trust-rotation-e2e']);
  assert.equal(result.status === 0, expectedSuccess, result.stderr || result.stdout);
  return expectedSuccess ? JSON.parse(result.stdout) : null;
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

async function readReceipts(workspace, mission) {
  const contents = await fs.readFile(journalPath(workspace, mission), 'utf8');
  return contents.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function pafReceipts(receipts) {
  return receipts.filter(receipt => receipt.schema === 'genos.instinct-paf-receipt/v1');
}

function sourceEvents(receipts) {
  return pafReceipts(receipts).flatMap(receipt => (receipt.sensory_source_refs || []).map(source => source.event_id));
}

run().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
