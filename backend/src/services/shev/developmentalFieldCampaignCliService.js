'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../../db/migrations/migrateGvxLedger');
const ledger = require('../gvxDevelopmentLedger');
const contract = require('./developmentalCampaignContract');
const runner = require('./developmentalCampaignRunner');
const field = require('./developmentalFieldCampaignService');
const files = require('./developmentalFieldCampaignStore');

function adapterDescriptor(adapterPath) {
  const absolute = path.resolve(adapterPath || '');
  let file;
  try { file = fs.statSync(absolute); } catch (_) { file = null; }
  if (!adapterPath || !file?.isFile()) throw contract.failure('SHEV_FIELD_ADAPTER_INVALID',
    'An existing adapter module file is required.');
  return { path: absolute,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') };
}

function matchingAdapter(actual, expected) {
  if (!expected) return;
  if (actual.path !== expected.path || actual.sha256 !== expected.sha256) {
    throw contract.failure('SHEV_FIELD_ADAPTER_CHANGED',
      'The adapter module differs from the prepared campaign lock.');
  }
}

async function loadAdapters(descriptor, context) {
  delete require.cache[require.resolve(descriptor.path)];
  const module = require(descriptor.path);
  if (typeof module.createAdapters !== 'function') throw contract.failure('SHEV_FIELD_ADAPTER_INVALID',
    'Adapter module must export createAdapters(context).');
  return module.createAdapters(Object.freeze({ ...context, adapterHash: descriptor.sha256 }));
}

function sealedManifest(input) {
  const candidate = input?.schema ? contract.verifyManifest(input) : contract.createManifest(input);
  if (candidate.mode !== 'field') throw contract.failure('SHEV_FIELD_MODE_REQUIRED',
    'The field CLI only accepts field manifests.');
  return candidate;
}

function sealTiming(manifest, now = Date.now()) {
  const start = Date.parse(manifest.startedAt);
  const first = Date.parse(manifest.trainingWindows[0].scheduledAt);
  if (start > now + 60_000 || now - start > 5 * 60_000 || first < now) {
    throw contract.failure('SHEV_CAMPAIGN_PREREGISTRATION_STALE',
      'Seal immediately before the campaign start and before its first window.');
  }
}

async function prepare(options) {
  const store = files.createStore(options.campaignDir);
  const manifest = sealedManifest(files.readJson(path.resolve(options.manifestPath)));
  const adapter = adapterDescriptor(options.adapterPath);
  const adapters = await loadAdapters(adapter, { command: 'prepare', store, manifest });
  const preparation = await field.prepareCampaign({ manifest, adapters });
  const record = { schema: 'genos.shev-field-preparation/v1', manifest, adapter, preparation };
  const pointer = files.savePrepared(store, record);
  return { command: 'prepare', campaignDir: store.campaignDir,
    manifestHash: manifest.manifestHash, objectHash: pointer.objectHash };
}

async function seal(options) {
  const store = files.createStore(options.campaignDir);
  if (fs.existsSync(store.seal)) return existingSeal(store, options.adapterPath);
  const prepared = files.loadPrepared(store);
  const adapter = adapterDescriptor(options.adapterPath || prepared.adapter.path);
  matchingAdapter(adapter, prepared.adapter);
  sealTiming(contract.verifyManifest(prepared.manifest));
  const adapters = await loadAdapters(adapter, { command: 'seal', store, manifest: prepared.manifest });
  const preparation = await field.prepareCampaign({ manifest: prepared.manifest, adapters });
  const record = { schema: 'genos.shev-field-seal/v1', manifest: prepared.manifest,
    adapter, preparation, preparedObjectHash: files.readJson(store.prepared).objectHash };
  await preregister(store, prepared.manifest);
  files.saveSeal(store, record);
  return sealSummary(store, record);
}

function existingSeal(store, adapterPath) {
  const record = files.loadSeal(store);
  const adapter = adapterDescriptor(adapterPath || record.adapter.path);
  matchingAdapter(adapter, record.adapter);
  return sealSummary(store, record);
}

async function preregister(store, manifest) {
  const db = await open({ filename: store.database, driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    await runner.preregister(db, manifest);
  } finally { await db.close(); }
}

function sealSummary(store, record) {
  return { command: 'seal', campaignDir: store.campaignDir,
    manifestHash: record.manifest.manifestHash, sealed: true };
}

async function tick(options) {
  const store = files.createStore(options.campaignDir);
  return files.withTickLock(store, async () => {
    const sealed = files.loadSeal(store);
    const adapter = adapterDescriptor(options.adapterPath || sealed.adapter.path);
    matchingAdapter(adapter, sealed.adapter);
    const adapters = await loadAdapters(adapter, { command: 'tick', store, manifest: sealed.manifest });
    const db = await open({ filename: store.database, driver: sqlite3.Database });
    try {
      await migrateGvxLedger(db);
      const report = await field.runCampaign({ db, manifest: sealed.manifest, adapters });
      return { command: 'tick', campaignDir: store.campaignDir, report };
    } finally { await db.close(); }
  });
}

function runCounts(journal) {
  const result = {};
  for (const arm of ['control', 'treatment']) {
    result[arm] = { training: [...journal[arm].keys()].filter((key) => key.startsWith('training:')).length,
      heldout: [...journal[arm].keys()].filter((key) => key.startsWith('heldout:')).length };
  }
  return result;
}

async function inspectDatabase(store, manifest, includeEvents) {
  if (!fs.existsSync(store.database)) return { report: null,
    runs: { control: { training: 0, heldout: 0 }, treatment: { training: 0, heldout: 0 } }, events: [] };
  const db = await open({ filename: store.database, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  try {
    const journal = await runner.existingRuns(db, manifest);
    const report = await runner.savedFinalReport(db, manifest);
    const scopes = [manifest.coordinator, manifest.arms.control.scope, manifest.arms.treatment.scope];
    const events = includeEvents ? (await Promise.all(scopes.map((scope) =>
      ledger.listAllEvents(db, scope)))).flat() : [];
    return { report, runs: runCounts(journal), events };
  } finally { await db.close(); }
}

async function status(options) {
  const store = files.createStore(options.campaignDir);
  const sealed = files.loadSeal(store);
  const inspected = await inspectDatabase(store, sealed.manifest, false);
  return { command: 'status', campaignDir: store.campaignDir,
    manifestHash: sealed.manifest.manifestHash,
    status: inspected.report?.status || 'not_started', runs: inspected.runs,
    report: inspected.report };
}

async function exportCampaign(options) {
  const store = files.createStore(options.campaignDir);
  const sealed = files.loadSeal(store);
  const inspected = await inspectDatabase(store, sealed.manifest, true);
  const payload = { schema: 'genos.shev-field-campaign-export/v1', manifest: sealed.manifest,
    preparation: sealed.preparation, report: inspected.report, runs: inspected.runs,
    events: inspected.events };
  const object = files.writeObject(store, 'export', payload);
  return { command: 'export', campaignDir: store.campaignDir,
    manifestHash: sealed.manifest.manifestHash, exportHash: object.digest, file: object.file };
}

module.exports = { prepare, seal, tick, status, exportCampaign, adapterDescriptor,
  loadAdapters, sealTiming };
