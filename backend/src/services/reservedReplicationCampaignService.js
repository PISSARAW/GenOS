'use strict';

const crypto = require('node:crypto');
const artifactHash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fail(code, message) { throw Object.assign(new Error(message), { code }); }

function validateSeeds(data) {
  const seeds = data.seeds;
  if (!Array.isArray(seeds) || seeds.length < 3
    || seeds.some((seed) => !Number.isSafeInteger(seed))
    || new Set(seeds).size !== seeds.length) {
    fail('INVALID_RESERVED_CAMPAIGN', 'At least three distinct integer seeds are required.');
  }
  if (!Array.isArray(data.developmentSeeds) || !data.developmentSeeds.length) {
    fail('INVALID_RESERVED_CAMPAIGN', 'Declare the development seeds before reserving the replication.');
  }
  if (seeds.some((seed) => data.developmentSeeds.includes(seed)) || data.reservedTouched === true) {
    fail('RESERVED_CONTAMINATION', 'Reserved and development execution must be disjoint.');
  }
}

function buildManifest(input) {
  const data = input || {};
  validateSeeds(data);
  if (!data.protocolId || !data.protocol || artifactHash(data.protocol) !== data.manifestHash) {
    fail('INVALID_RESERVED_CAMPAIGN', 'A hash-bound immutable protocol is required.');
  }
  const manifest = { campaignId: data.campaignId || crypto.randomUUID(), protocolId: data.protocolId,
    protocol: structuredClone(data.protocol), protocolHash: data.manifestHash,
    profile: data.profile || 'composed-perceptual', seeds: [...data.seeds],
    developmentSeeds: [...data.developmentSeeds], reserved: true };
  return { ...manifest, manifestHash: artifactHash(manifest) };
}

function wilson(successes, total) {
  if (!total) return { low: 0, high: 0 };
  const z = 1.96; const p = successes / total; const denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const spread = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator;
  return { low: Math.max(0, center - spread), high: Math.min(1, center + spread) };
}

function summarize(results) {
  const list = Array.isArray(results) ? results : [];
  const successes = list.filter((result) => result?.status === 'success').length;
  return { total: list.length, successes, negatives: list.length - successes,
    successRate: list.length ? successes / list.length : 0,
    interval95: wilson(successes, list.length), results: list };
}

function validManifest(manifest) {
  if (!manifest) return false;
  const { manifestHash, ...body } = manifest;
  return artifactHash(body) === manifestHash && artifactHash(body.protocol) === body.protocolHash;
}

function completeResults(manifest, results) {
  if (!Array.isArray(results) || results.length !== manifest.seeds.length) return false;
  const ids = new Set(results.map((result) => result.seed));
  if (ids.size !== manifest.seeds.length) return false;
  return results.every((result) => manifest.seeds.includes(result.seed)
    && result.manifestHash === manifest.manifestHash
    && ['success', 'failed', 'inconclusive'].includes(result.status));
}

function finalizeCampaign(manifest, results) {
  if (!validManifest(manifest)) fail('RESERVED_PROTOCOL_DRIFT', 'Reserved manifest changed after registration.');
  const summary = summarize(results);
  const replayable = completeResults(manifest, results);
  const artifact = { manifest, summary };
  return { ...artifact, artifactHash: artifactHash(artifact), replayable, promotionAllowed: false };
}

async function runCampaign(input) {
  if (typeof input.runner !== 'function' || typeof input.preregister !== 'function') {
    fail('INVALID_RESERVED_CAMPAIGN', 'Runner and durable preregistration are required.');
  }
  const manifest = buildManifest(input);
  const registration = await input.preregister(structuredClone(manifest));
  if (registration?.manifestHash !== manifest.manifestHash || !registration.registrationId) {
    fail('RESERVED_NOT_REGISTERED', 'Protocol must be registered before the first reserved run.');
  }
  const results = [];
  for (const seed of manifest.seeds) {
    let result;
    try { result = await input.runner({ seed, protocol: structuredClone(manifest.protocol) }); }
    catch (error) { result = { status: 'failed', error: String(error.message).slice(0, 300) }; }
    results.push({ ...result, seed, manifestHash: manifest.manifestHash });
  }
  return { ...finalizeCampaign(manifest, results), registrationId: registration.registrationId,
    limitation: 'Reserved seeds do not establish an independently held-out corpus or independent verification.' };
}

module.exports = { buildManifest, summarize, finalizeCampaign, artifactHash, runCampaign };
