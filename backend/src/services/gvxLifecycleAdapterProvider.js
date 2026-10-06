'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

let cachedProvider;
let cachedIdentity;

function configuredProvider() {
  const sourcePath = process.env.GENOS_GVX_LIFECYCLE_ADAPTER_MODULE;
  if (!sourcePath) return require('./gvxStandardLifecycleAdapters');
  const expected = String(process.env.GENOS_GVX_LIFECYCLE_ADAPTER_SHA256 || '').toLowerCase();
  if (!sourcePath || !/^[a-f0-9]{64}$/.test(expected)) throw providerError('GVX_LIFECYCLE_ADAPTERS_NOT_CONFIGURED');
  const absolute = path.resolve(sourcePath);
  const observed = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  if (observed !== expected) throw providerError('GVX_LIFECYCLE_ADAPTER_DIGEST_MISMATCH');
  return require(absolute);
}

function loadProvider() {
  const identity = JSON.stringify([process.env.GENOS_GVX_LIFECYCLE_ADAPTER_MODULE || 'standard', process.env.GENOS_GVX_LIFECYCLE_ADAPTER_SHA256 || '']);
  const provider = configuredProvider();
  if (cachedProvider && identity !== cachedIdentity) throw providerError('GVX_LIFECYCLE_ADAPTER_CONFIGURATION_CHANGED');
  if (cachedProvider) return cachedProvider;
  if (typeof provider.createAdapters !== 'function') throw providerError('GVX_LIFECYCLE_ADAPTER_MODULE_INVALID');
  cachedIdentity = identity;
  cachedProvider = provider;
  return cachedProvider;
}

async function runConfiguredCycle(db, signal) {
  const adapters = await loadProvider().createAdapters({ db, signal });
  if (!adapters || typeof adapters !== 'object' || Array.isArray(adapters)) {
    throw providerError('GVX_LIFECYCLE_ADAPTERS_INVALID');
  }
  const controlFingerprint = adapters.controlFingerprint || process.env.GENOS_GVX_LIFECYCLE_ADAPTER_SHA256;
  return require('./gvxDevelopmentController').runCycle(db, { ...adapters, controlFingerprint, signal });
}

function providerError(code) { return Object.assign(new Error(code), { code }); }

module.exports = { runConfiguredCycle, loadProvider };
