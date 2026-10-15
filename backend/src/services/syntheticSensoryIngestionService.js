'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');

const INPUT_SCHEMA = 'genos.signed-synthetic-sensory-input/v1';
const TRUST_SCHEMA = 'genos.synthetic-sensory-producer-trust/v1';
const CLAIMS_SCHEMA = 'genos.synthetic-sensory-claims/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ENVELOPE_BYTES = 1_048_576;
const PUBLIC_KEY_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

async function migrateSyntheticSensoryReceipts(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS synthetic_sensory_receipts (
    mission_id TEXT NOT NULL REFERENCES missions(mission_id) ON DELETE CASCADE,
    producer_id TEXT NOT NULL,
    tick INTEGER NOT NULL CHECK(tick > 0),
    stimulus_sha256 TEXT NOT NULL,
    signature_hex TEXT NOT NULL,
    trust_key_sha256 TEXT NOT NULL,
    signal_json TEXT NOT NULL CHECK(json_valid(signal_json)),
    payload_hash TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mission_id, producer_id, tick)
  );
  CREATE INDEX IF NOT EXISTS idx_synthetic_sensory_mission_tick
    ON synthetic_sensory_receipts(mission_id, tick);
  CREATE TRIGGER IF NOT EXISTS synthetic_sensory_receipt_no_update
    BEFORE UPDATE ON synthetic_sensory_receipts
    BEGIN SELECT RAISE(ABORT, 'Immutable synthetic sensory receipt'); END;
  CREATE TRIGGER IF NOT EXISTS synthetic_sensory_receipt_no_delete
    BEFORE DELETE ON synthetic_sensory_receipts
    BEGIN SELECT RAISE(ABORT, 'Immutable synthetic sensory receipt'); END;
  CREATE TABLE IF NOT EXISTS synthetic_sensory_paf_dispatches (
    mission_id TEXT NOT NULL,
    producer_id TEXT NOT NULL,
    tick INTEGER NOT NULL CHECK(tick > 0),
    payload_hash TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('reserved', 'complete')),
    lease_token TEXT NOT NULL,
    lease_expires_at INTEGER NOT NULL,
    source_digest TEXT,
    paf_receipt_json TEXT CHECK(paf_receipt_json IS NULL OR json_valid(paf_receipt_json)),
    rust_tick INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mission_id, producer_id, tick),
    FOREIGN KEY (mission_id, producer_id, tick)
      REFERENCES synthetic_sensory_receipts(mission_id, producer_id, tick) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_synthetic_sensory_paf_dispatch_expiry
    ON synthetic_sensory_paf_dispatches(state, lease_expires_at);`);
}

async function claimSyntheticSensoryPafDispatch(db, input) {
  const now = Date.now();
  const leaseToken = crypto.randomUUID();
  return withTransaction(db, async () => {
    const row = await db.get(`SELECT * FROM synthetic_sensory_paf_dispatches
      WHERE mission_id=? AND producer_id=? AND tick=?`, input.missionId, input.producerId, input.tick);
    if (row && row.payload_hash !== input.payloadHash) throw sensoryError('SENSORY_PAF_PAYLOAD_CONFLICT');
    if (row?.state === 'complete') return completedDispatch(row);
    if (row && row.lease_expires_at > now) return { state: 'busy' };
    await reserveDispatch(db, { input, now, leaseToken });
    return { state: 'reserved', leaseToken };
  });
}

async function completeSyntheticSensoryPafDispatch(db, input) {
  validateDispatchCompletion(input);
  return withTransaction(db, async () => {
    const result = await db.run(`UPDATE synthetic_sensory_paf_dispatches
      SET state='complete', source_digest=?, paf_receipt_json=?, rust_tick=?, lease_expires_at=0,
        updated_at=CURRENT_TIMESTAMP
      WHERE mission_id=? AND producer_id=? AND tick=? AND payload_hash=? AND lease_token=? AND state='reserved'`,
    input.sourceDigest, JSON.stringify(input.pafReceipt), input.rustTick, input.missionId,
    input.producerId, input.tick, input.payloadHash, input.leaseToken);
    if (result.changes !== 1) throw sensoryError('SENSORY_PAF_CLAIM_LOST');
    return { state: 'complete', sourceDigest: input.sourceDigest, pafReceipt: input.pafReceipt, rustTick: input.rustTick };
  });
}

function validateDispatchCompletion(input) {
  const referencesSource = input.pafReceipt?.paf?.sensory_source_refs?.some(
    source => source?.source_digest === input.sourceDigest);
  if (!/^[0-9a-f]{64}$/i.test(input.sourceDigest || '') || !Number.isSafeInteger(input.rustTick)
    || input.rustTick < 0 || !referencesSource
    || input.pafReceipt?.import?.receipt?.source_digest !== input.sourceDigest) {
    throw sensoryError('SENSORY_PAF_COMPLETION_INVALID');
  }
}

async function releaseSyntheticSensoryPafDispatch(db, input) {
  await db.run(`UPDATE synthetic_sensory_paf_dispatches SET lease_expires_at=0, updated_at=CURRENT_TIMESTAMP
    WHERE mission_id=? AND producer_id=? AND tick=? AND payload_hash=? AND lease_token=? AND state='reserved'`,
  input.missionId, input.producerId, input.tick, input.payloadHash, input.leaseToken);
}

async function reserveDispatch(db, input) {
  const values = [input.input.missionId, input.input.producerId, input.input.tick, input.input.payloadHash,
    input.leaseToken, input.now + 120_000];
  const row = await db.get(`SELECT state FROM synthetic_sensory_paf_dispatches
    WHERE mission_id=? AND producer_id=? AND tick=?`, input.input.missionId, input.input.producerId, input.input.tick);
  if (row) {
    const result = await db.run(`UPDATE synthetic_sensory_paf_dispatches SET lease_token=?, lease_expires_at=?, updated_at=CURRENT_TIMESTAMP
      WHERE mission_id=? AND producer_id=? AND tick=? AND state='reserved' AND lease_expires_at<=?`,
    input.leaseToken, input.now + 120_000, input.input.missionId, input.input.producerId, input.input.tick, input.now);
    if (result.changes !== 1) throw sensoryError('SENSORY_PAF_CLAIM_BUSY');
    return;
  }
  await db.run(`INSERT INTO synthetic_sensory_paf_dispatches
    (mission_id, producer_id, tick, payload_hash, state, lease_token, lease_expires_at)
    VALUES (?, ?, ?, ?, 'reserved', ?, ?)`, values);
}

function completedDispatch(row) {
  if (!/^[0-9a-f]{64}$/i.test(row.source_digest || '') || !row.paf_receipt_json
    || row.rust_tick === null || !Number.isSafeInteger(Number(row.rust_tick)) || Number(row.rust_tick) < 0) {
    throw sensoryError('SENSORY_PAF_COMPLETION_INCOMPLETE');
  }
  const rust = JSON.parse(row.paf_receipt_json);
  if (rust?.import?.receipt?.source_digest !== row.source_digest || !rust.paf) {
    throw sensoryError('SENSORY_PAF_COMPLETION_INCOMPLETE');
  }
  return { state: 'complete', sourceDigest: row.source_digest, rust, rustTick: Number(row.rust_tick) };
}

async function ingestSyntheticSensoryReceipt({ db, missionId, input, trustJson }) {
  const claims = validateEnvelope(missionId, input);
  const producerTrust = loadProducerTrust(trustJson);
  const key = producerTrust.get(claims.producerId);
  if (!key) throw sensoryError('SENSORY_PRODUCER_UNTRUSTED');
  const signalJson = serializeSignal(input.signal);
  const stimulusSha256 = digestStimulus(claims.producerId, claims.tick, signalJson);
  const trustKeySha256 = verifyProducer({ key, claims, stimulusSha256, signatureHex: input.signature_hex });
  const normalized = { missionId, producerId: claims.producerId, tick: claims.tick, stimulusSha256,
    signatureHex: input.signature_hex.toLowerCase(), trustKeySha256, signalJson };
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  await migrateSyntheticSensoryReceipts(db);
  return withTransaction(db, () => persistReceipt(db, normalized, payloadHash));
}

function validateEnvelope(missionId, input) {
  validateEnvelopeShape(missionId, input);
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_ENVELOPE_BYTES) throw sensoryError('SENSORY_ENVELOPE_TOO_LARGE');
  validateEnvelopeFields(input);
  return { missionId: missionId.toLowerCase(), producerId: input.producer_id.toLowerCase(), tick: input.tick };
}

function validateEnvelopeShape(missionId, input) {
  if (!isUuid(missionId) || !input || typeof input !== 'object' || Array.isArray(input)) throw sensoryError('SENSORY_ENVELOPE_INVALID');
}

function validateEnvelopeFields(input) {
  const allowed = ['schema', 'producer_id', 'signature_hex', 'tick', 'signal'];
  if (Object.keys(input).some((key) => !allowed.includes(key)) || input.schema !== INPUT_SCHEMA
    || !isUuid(input.producer_id) || !Number.isSafeInteger(input.tick) || input.tick < 1
    || !/^[0-9a-f]{128}$/i.test(input.signature_hex || '')) throw sensoryError('SENSORY_ENVELOPE_INVALID');
}

function loadProducerTrust(source) {
  if (!source) throw sensoryError('SENSORY_PRODUCER_TRUST_UNAVAILABLE');
  const config = parseProducerTrust(source);
  const result = new Map();
  for (const producer of config.producers) addTrustedProducer(result, producer);
  return result;
}

function parseProducerTrust(source) {
  let config;
  try { config = JSON.parse(source); } catch (_) { throw sensoryError('SENSORY_PRODUCER_TRUST_INVALID'); }
  if (!config || config.schema !== TRUST_SCHEMA || !Array.isArray(config.producers) || !config.producers.length) {
    throw sensoryError('SENSORY_PRODUCER_TRUST_INVALID');
  }
  return config;
}

function addTrustedProducer(result, producer) {
  if (!isUuid(producer?.producer_id) || !/^[0-9a-f]{64}$/i.test(producer.public_key_hex || '')) {
    throw sensoryError('SENSORY_PRODUCER_TRUST_INVALID');
  }
  const id = producer.producer_id.toLowerCase();
  if (result.has(id)) throw sensoryError('SENSORY_PRODUCER_TRUST_INVALID');
  const raw = Buffer.from(producer.public_key_hex, 'hex');
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([PUBLIC_KEY_PREFIX, raw]), type: 'spki', format: 'der' });
    result.set(id, key);
  } catch (_) {
    throw sensoryError('SENSORY_PRODUCER_TRUST_INVALID');
  }
}

function verifyProducer(spec) {
  if (!crypto.verify(null, producerSigningBytes(spec.claims, spec.stimulusSha256), spec.key, Buffer.from(spec.signatureHex, 'hex'))) {
    throw sensoryError('SENSORY_PRODUCER_SIGNATURE_INVALID');
  }
  const rawKey = spec.key.export({ type: 'spki', format: 'der' }).subarray(-32);
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function producerSigningBytes(claims, stimulusSha256) {
  return Buffer.from(JSON.stringify({ schema: CLAIMS_SCHEMA, missionId: claims.missionId,
    tick: claims.tick, producerId: claims.producerId, stimulusSha256 }));
}

function digestStimulus(producerId, tick, signalJson) {
  const canonical = `{"producerId":${JSON.stringify(producerId)},"schema":"genos.synthetic-sensory-stimulus/v1","signal":${signalJson},"tick":${tick}}`;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function serializeSignal(signal) {
  if (!signal || typeof signal !== 'object' || Array.isArray(signal)) throw sensoryError('SENSORY_SIGNAL_INVALID');
  validateTypedSignal(signal);
  const serializers = {
    compass: () => objectJson(signal, ['sensor', 'goal', 'current'], { sensor: textValue, goal: numberArray, current: numberArray }),
    active_electroreception: () => objectJson(signal, ['sensor', 'impedance_samples'], { sensor: textValue, impedance_samples: numberArray }),
    passive_electroreception: () => objectJson(signal, ['sensor', 'ambient_uv'], { sensor: textValue, ambient_uv: numberArray }),
    vomeronasal: () => objectJson(signal, ['sensor', 'signal'], { sensor: textValue, signal: serializePheromone }),
    thermal_fusion: () => objectJson(signal, ['sensor', 'visual_nodes', 'thermal_readings'], { sensor: textValue, visual_nodes: nodePairs, thermal_readings: nodePairs }),
    echolocation: () => objectJson(signal, ['sensor', 'bandwidth_khz', 'duration_ms', 'echoes'], {
      sensor: textValue, bandwidth_khz: finiteNumber, duration_ms: finiteNumber, echoes: echoList
    })
  };
  const sensor = signal.sensor;
  if (!Object.hasOwn(serializers, sensor)) throw sensoryError('SENSORY_SIGNAL_INVALID');
  return serializers[sensor]();
}

function validateTypedSignal(signal) {
  const checks = {
    compass: () => validateCompass(signal),
    active_electroreception: () => validateSamples(signal, 'impedance_samples'),
    passive_electroreception: () => validateSamples(signal, 'ambient_uv'),
    vomeronasal: () => validatePheromone(signal.signal),
    thermal_fusion: () => validateNodeCollections(signal),
    echolocation: () => validateEcholocation(signal)
  };
  if (Object.hasOwn(checks, signal.sensor)) checks[signal.sensor]();
}

function validateCompass(signal) {
  const { goal, current } = signal;
  numberArray(goal);
  numberArray(current);
  if (goal.length !== current.length || goal.length < 2 || goal.length > 2048) throw sensoryError('SENSORY_SIGNAL_INVALID');
}

function validateSamples(signal, field) { numberArray(signal[field]); }

function validatePheromone(value) {
  validatePheromoneIdentity(value);
  validatePheromonePayload(value.subliminal_payload);
  pheromoneType(value.pheromone_type);
}

function validatePheromoneIdentity(value) {
  if (!value || typeof value.source_agent !== 'string' || !value.source_agent || value.source_agent.length > 256
    || typeof value.locus !== 'string' || !value.locus || value.locus.length > 256) throw sensoryError('SENSORY_SIGNAL_INVALID');
  validatePheromoneMetrics(value);
}

function validatePheromoneMetrics(value) {
  if (!Number.isFinite(value.concentration) || value.concentration < 0 || value.concentration > 1
    || !Number.isFinite(value.half_life_secs) || value.half_life_secs <= 0
    || !Number.isSafeInteger(value.timestamp_epoch_ms) || value.timestamp_epoch_ms < 0) throw sensoryError('SENSORY_SIGNAL_INVALID');
}

function validatePheromonePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length > 64
    || Object.entries(payload).some(([key, item]) => key.length > 256 || typeof item !== 'string' || item.length > 1024)) {
    throw sensoryError('SENSORY_SIGNAL_INVALID');
  }
}

function validateNodeCollections(signal) {
  validateNodes(signal.visual_nodes);
  validateNodes(signal.thermal_readings);
}

function validateNodes(value) {
  if (!Array.isArray(value) || value.length > 1024 || value.some((pair) => !Array.isArray(pair)
    || pair.length !== 2 || typeof pair[0] !== 'string' || !pair[0] || pair[0].length > 256
    || typeof pair[1] !== 'number' || !Number.isFinite(pair[1]))) throw sensoryError('SENSORY_SIGNAL_INVALID');
}

function validateEcholocation(signal) {
  if (!Number.isFinite(signal.bandwidth_khz) || signal.bandwidth_khz <= 0
    || !Number.isFinite(signal.duration_ms) || signal.duration_ms <= 0
    || !Array.isArray(signal.echoes) || signal.echoes.length > 256) throw sensoryError('SENSORY_SIGNAL_INVALID');
  signal.echoes.forEach(validateEcho);
}

function validateEcho(echo) {
  if (typeof echo?.target_locus !== 'string' || !echo.target_locus || echo.target_locus.length > 256) throw sensoryError('SENSORY_SIGNAL_INVALID');
  if (!Number.isFinite(echo.time_of_flight_ms) || echo.time_of_flight_ms < 0
    || !Number.isFinite(echo.doppler_shift_hz) || !Number.isFinite(echo.attenuation_db)) throw sensoryError('SENSORY_SIGNAL_INVALID');
}

function serializePheromone(value) {
  return objectJson(value, ['source_agent', 'locus', 'pheromone_type', 'concentration', 'half_life_secs', 'timestamp_epoch_ms', 'subliminal_payload'], {
    source_agent: textValue, locus: textValue, pheromone_type: pheromoneType,
    concentration: finiteNumber, half_life_secs: finiteNumber, timestamp_epoch_ms: integerValue, subliminal_payload: stringMap
  });
}

function objectJson(value, fields, formatters) {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== fields.length
    || !fields.every((field) => Object.hasOwn(value, field))) {
    throw sensoryError('SENSORY_SIGNAL_INVALID');
  }
  return `{${[...fields].sort().map((field) => `${JSON.stringify(field)}:${formatters[field](value[field])}`).join(',')}}`;
}

function numberArray(value) {
  if (!Array.isArray(value) || !value.length || value.length > 4096) throw sensoryError('SENSORY_SIGNAL_INVALID');
  return `[${value.map(finiteNumber).join(',')}]`;
}

function finiteNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw sensoryError('SENSORY_SIGNAL_INVALID');
  const encoded = JSON.stringify(value);
  return Number.isInteger(value) && !/[.e]/i.test(encoded) ? `${encoded}.0` : encoded;
}

function integerValue(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw sensoryError('SENSORY_SIGNAL_INVALID');
  return String(value);
}

function textValue(value) {
  if (typeof value !== 'string') throw sensoryError('SENSORY_SIGNAL_INVALID');
  return JSON.stringify(value);
}

function pheromoneType(value) {
  if (['Alarm', 'AggressionDefense', 'MatingCooperation', 'TerritoryMark', 'Trail'].includes(value)) return JSON.stringify(value);
  if (value && typeof value.Custom === 'string' && Object.keys(value).length === 1) return `{"Custom":${JSON.stringify(value.Custom)}}`;
  throw sensoryError('SENSORY_SIGNAL_INVALID');
}

function stringMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw sensoryError('SENSORY_SIGNAL_INVALID');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${textValue(value[key])}`).join(',')}}`;
}

function nodePairs(value) {
  if (!Array.isArray(value) || value.length > 1024) throw sensoryError('SENSORY_SIGNAL_INVALID');
  return `[${value.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) throw sensoryError('SENSORY_SIGNAL_INVALID');
    return `[${textValue(pair[0])},${finiteNumber(pair[1])}]`;
  }).join(',')}]`;
}

function echoList(value) {
  if (!Array.isArray(value) || value.length > 256) throw sensoryError('SENSORY_SIGNAL_INVALID');
  const fields = ['target_locus', 'time_of_flight_ms', 'doppler_shift_hz', 'attenuation_db'];
  return `[${value.map((echo) => `{${fields.map((field) => `${JSON.stringify(field)}:${field === 'target_locus' ? textValue(echo?.[field]) : finiteNumber(echo?.[field])}`).join(',')}}`).join(',')}]`;
}

async function persistReceipt(db, receipt, payloadHash) {
  const mission = await db.get('SELECT mission_id FROM missions WHERE mission_id = ?', receipt.missionId);
  if (!mission) throw sensoryError('SENSORY_MISSION_NOT_FOUND');
  const existing = await db.get(`SELECT payload_hash FROM synthetic_sensory_receipts
    WHERE mission_id = ? AND producer_id = ? AND tick = ?`, receipt.missionId, receipt.producerId, receipt.tick);
  if (existing) {
    if (existing.payload_hash !== payloadHash) throw sensoryError('SENSORY_TICK_CONFLICT');
    return { duplicate: true, missionId: receipt.missionId, producerId: receipt.producerId, tick: receipt.tick, payloadHash };
  }
  const latest = await db.get(`SELECT MAX(tick) AS tick FROM synthetic_sensory_receipts
    WHERE mission_id = ? AND producer_id = ?`, receipt.missionId, receipt.producerId);
  if (receipt.tick <= (latest?.tick || 0)) throw sensoryError('SENSORY_TICK_STALE');
  await db.run(`INSERT INTO synthetic_sensory_receipts
    (mission_id, producer_id, tick, stimulus_sha256, signature_hex, trust_key_sha256, signal_json, payload_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, receipt.missionId, receipt.producerId, receipt.tick,
  receipt.stimulusSha256, receipt.signatureHex, receipt.trustKeySha256, receipt.signalJson, payloadHash);
  return { duplicate: false, missionId: receipt.missionId, producerId: receipt.producerId, tick: receipt.tick, payloadHash };
}

function isUuid(value) { return typeof value === 'string' && UUID.test(value); }
function sensoryError(code) { return Object.assign(new Error(code), { code }); }

module.exports = { INPUT_SCHEMA, TRUST_SCHEMA, ingestSyntheticSensoryReceipt, serializeSignal, digestStimulus,
  claimSyntheticSensoryPafDispatch, completeSyntheticSensoryPafDispatch, releaseSyntheticSensoryPafDispatch };
