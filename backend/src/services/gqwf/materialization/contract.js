'use strict';

const crypto = require('node:crypto');

const CONTRACT_VERSION = 1;
const METHODS = ['probe', 'materialize', 'capture', 'release', 'recover'];
const MATERIALIZATIONS = new Set(['eager', 'lazy']);
const GRANULARITIES = new Set(['none', 'file', 'block', 'chunk']);

function assertMaterializer(driver) {
  if (!driver || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(driver.id || '')) {
    throw new Error('GQWF materializer requires a stable backend ID.');
  }
  if (driver.contractVersion !== CONTRACT_VERSION) {
    throw new Error(`GQWF materializer '${driver.id}' uses an unsupported contract version.`);
  }
  for (const method of METHODS) {
    if (typeof driver[method] !== 'function') {
      throw new Error(`GQWF materializer '${driver.id}' is missing '${method}'.`);
    }
  }
  return driver;
}

function normalizeCapabilities(driver, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`GQWF materializer '${driver.id}' returned invalid capabilities.`);
  }
  if (!MATERIALIZATIONS.has(value.materialization)
    || !GRANULARITIES.has(value.copyGranularity)) {
    throw new Error(`GQWF materializer '${driver.id}' returned unsupported capabilities.`);
  }
  return {
    backendId: driver.id,
    contractVersion: driver.contractVersion,
    available: value.available === true,
    unavailableReason: value.available === true ? null : String(value.unavailableReason || 'unavailable'),
    platform: String(value.platform || process.platform),
    materialization: value.materialization,
    copyGranularity: value.copyGranularity,
    requiresMount: value.requiresMount === true,
    portable: value.portable === true,
    supportsCapture: value.supportsCapture === true,
    supportsRecovery: value.supportsRecovery === true
  };
}

function stableJson(value) {
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

async function probe(driver, context = {}) {
  assertMaterializer(driver);
  return normalizeCapabilities(driver, await driver.probe(context));
}

module.exports = {
  CONTRACT_VERSION,
  assertMaterializer,
  digest,
  normalizeCapabilities,
  probe,
  stableJson
};
