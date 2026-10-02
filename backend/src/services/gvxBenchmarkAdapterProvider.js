'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

let provider;

function loadProvider() {
  if (provider) return provider;
  const source = process.env.GENOS_GVX_BENCHMARK_ADAPTER_MODULE;
  const expected = String(process.env.GENOS_GVX_BENCHMARK_ADAPTER_SHA256 || '').toLowerCase();
  if (!source || !/^[a-f0-9]{64}$/.test(expected)) throw providerError('GVX_BENCHMARK_ADAPTERS_NOT_CONFIGURED');
  const absolute = path.resolve(source);
  const observed = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  if (observed !== expected) throw providerError('GVX_BENCHMARK_ADAPTER_DIGEST_MISMATCH');
  provider = require(absolute);
  if (typeof provider.createCampaign !== 'function') throw providerError('GVX_BENCHMARK_ADAPTER_MODULE_INVALID');
  return provider;
}

async function createConfiguredCampaign(signal) {
  const campaign = await loadProvider().createCampaign({ signal });
  if (!campaign || typeof campaign !== 'object' || Array.isArray(campaign)) {
    throw providerError('GVX_BENCHMARK_CAMPAIGN_INVALID');
  }
  return { ...campaign, signal };
}

function providerError(code) { return Object.assign(new Error(code), { code }); }

module.exports = { loadProvider, createConfiguredCampaign };
