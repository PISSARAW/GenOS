'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ARMS } = require('./longitudinalBenchmarkService');

let cached = null;

function fail(code) { return Object.assign(new Error(code), { code }); }

function loadAdapter(environment = process.env) {
  const source = environment.GENOS_HOLOBIONT_BENCHMARK_ADAPTER_MODULE;
  const expected = String(environment.GENOS_HOLOBIONT_BENCHMARK_ADAPTER_SHA256 || '').toLowerCase();
  if (!source || !/^[a-f0-9]{64}$/.test(expected)) throw fail('HOLOBIONT_BENCHMARK_ADAPTER_NOT_CONFIGURED');
  const absolute = path.resolve(source);
  const observed = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  if (observed !== expected) throw fail('HOLOBIONT_BENCHMARK_ADAPTER_DIGEST_MISMATCH');
  if (!cached || cached.path !== absolute || cached.digest !== observed) {
    const loaded = require(absolute);
    if (typeof loaded.createCampaign !== 'function') throw fail('HOLOBIONT_BENCHMARK_ADAPTER_INVALID');
    cached = { path: absolute, digest: observed, module: loaded };
  }
  return cached;
}

function readManifest(manifestPath) {
  if (!manifestPath) throw fail('HOLOBIONT_BENCHMARK_MANIFEST_REQUIRED');
  const absolute = path.resolve(manifestPath);
  const bytes = fs.readFileSync(absolute);
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch { throw fail('HOLOBIONT_BENCHMARK_MANIFEST_INVALID_JSON'); }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.missions)) {
    throw fail('HOLOBIONT_BENCHMARK_MANIFEST_INVALID');
  }
  return { absolute, bytes, manifest };
}

function assertAdapters(adapters) {
  const missing = ARMS.filter((arm) => typeof adapters?.[arm] !== 'function');
  if (missing.length) throw fail(`HOLOBIONT_BENCHMARK_ARM_ADAPTERS_MISSING:${missing.join(',')}`);
}

function validateMissions(missions) {
  const ids = Array.isArray(missions) ? missions.map((mission) => String(mission?.id || mission?.missionId || '').trim()) : [];
  if (ids.length < 50 || ids.length > 100 || ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw fail('HOLOBIONT_BENCHMARK_MISSIONS_INVALID');
  }
}

async function createConfiguredCampaign(options = {}) {
  const loaded = loadAdapter(options.environment);
  const source = readManifest(options.manifestPath);
  const campaign = await loaded.module.createCampaign({
    manifest: source.manifest, signal: options.signal, campaignId: source.manifest.benchmarkId
  });
  if (!campaign || typeof campaign !== 'object' || Array.isArray(campaign)) throw fail('HOLOBIONT_BENCHMARK_CAMPAIGN_INVALID');
  assertAdapters(campaign.armAdapters);
  validateMissions(source.manifest.missions);
  return {
    benchmarkId: String(campaign.benchmarkId || source.manifest.benchmarkId || '').trim(),
    missions: source.manifest.missions,
    armAdapters: campaign.armAdapters,
    manifest: source.manifest,
    manifestSha256: crypto.createHash('sha256').update(source.bytes).digest('hex'),
    adapterSha256: loaded.digest,
    adapterPath: loaded.path
  };
}

module.exports = { assertAdapters, createConfiguredCampaign, loadAdapter, readManifest };
