'use strict';

const { createHash } = require('node:crypto');
const { withTransaction } = require('../../db');
const { consumeAuthorization } = require('./authorityService');
const { requireActive } = require('./runtimeGuard');
const { normalizeRelativePath } = require('../pathSafety');
const { FORBIDDEN } = require('../ontogenesis/integrationService');

function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function sensorContract(input) {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(input?.id) || !input.dimension
    || !Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1000 || input.intervalMs > 2592000000) {
    throw new TypeError('SHEV sensor requires identity, dimension and a bounded interval.');
  }
  return { adapter: input.adapter, dimension: input.dimension,
    config: normalizedConfig(input), intervalMs: input.intervalMs };
}

function normalizedConfig(input) {
  const config = input.config || {};
  if (input.adapter === 'web-audit') return validateWeb(config);
  const relativePath = normalizeRelativePath(config.relativePath, 'SHEV sensor');
  const target = config.target || 'project';
  if (!['project', 'integration'].includes(target)) throw new Error('SHEV sensor target is invalid.');
  if (FORBIDDEN.some(pattern => pattern.test(relativePath))) throw new Error('SHEV sensor path is forbidden.');
  if (input.adapter === 'data-freshness' && validFreshness(config)) {
    return { relativePath, target, maxAgeMs: config.maxAgeMs };
  }
  if (input.adapter === 'json-contract' && validJson(config)) {
    return { relativePath, target, pointer: config.pointer, expectedSha256: config.expectedSha256 };
  }
  throw new TypeError('SHEV sensor adapter or configuration is invalid.');
}

function validFreshness(config) { return Number.isSafeInteger(config.maxAgeMs) && config.maxAgeMs > 0; }

function validJson(config) {
  return /^[a-f0-9]{64}$/.test(config.expectedSha256) && typeof config.pointer === 'string'
    && config.pointer.length <= 256 && (config.pointer === '' || config.pointer.startsWith('/'));
}

function validateWeb(config) {
  const { validateConfig } = require('../webAuditService');
  const hosts = (process.env.GENOS_BROWSER_VERIFICATION_HOSTS || '').split(',').map(host => host.trim().toLowerCase());
  validateConfig(config, hosts);
  if (Buffer.byteLength(JSON.stringify(config)) > 32768) throw new Error('SHEV web configuration is too large.');
  return JSON.parse(JSON.stringify(config));
}

async function enrollSensor(db, input) {
  const contract = sensorContract(input);
  return withTransaction(db, async () => {
    const responsibility = await requireActive(db, { projectId: input.projectId, expectedVersion: input.expectedVersion });
    if (!responsibility.mandate.dimensions.some(dimension => dimension.name === contract.dimension)) {
      throw new Error('SHEV sensor dimension is outside the mandate.');
    }
    await consumeAuthorization(db, { ...input.authorization, operation: 'sensor-enrollment',
      projectId: input.projectId, subjectId: input.id, expectedVersion: responsibility.mandateVersion,
      details: contract });
    await db.run(`INSERT INTO shev_sensors
      (id, project_id, mandate_version, adapter, dimension, config_json, interval_ms, next_due_at, authorization_nonce)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [input.id, input.projectId, responsibility.mandateVersion,
      contract.adapter, contract.dimension, JSON.stringify(contract.config), contract.intervalMs,
      new Date().toISOString(), input.authorization.nonce]);
    return db.get('SELECT * FROM shev_sensors WHERE id = ?', [input.id]);
  });
}

async function sampleSensor(db, input) {
  const sensor = input.sensor;
  const config = { ...JSON.parse(sensor.config_json), projectId: sensor.project_id,
    dimension: sensor.dimension, sampleRef: input.sampleRef };
  if (sensor.adapter === 'data-freshness') {
    return require('./adapters/dataFreshnessAdapter').inspectDataFreshness(db, config);
  }
  if (sensor.adapter === 'json-contract') {
    return require('./adapters/jsonContractAdapter').inspectJsonContract(db, config);
  }
  const { observation } = await require('./adapters/webAuditAdapter').recordWebObservation(db,
    { projectId: sensor.project_id, dimension: sensor.dimension, config: JSON.parse(sensor.config_json) });
  return observation;
}

module.exports = { enrollSensor, sensorContract, sampleSensor, digest };
