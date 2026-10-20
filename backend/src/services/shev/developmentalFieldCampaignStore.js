'use strict';

const fs = require('fs');
const path = require('path');
const { fingerprint } = require('../stateFingerprint');
const contract = require('./developmentalCampaignContract');

function failure(code, detail) { return contract.failure(code, detail); }

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
    throw failure('SHEV_FIELD_STATE_INVALID', `Cannot read ${file}: ${error.message}`);
  }
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  try { fs.renameSync(temporary, file); } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function createStore(root) {
  const campaignDir = path.resolve(root || '');
  if (!root || path.parse(campaignDir).root === campaignDir) {
    throw failure('SHEV_FIELD_DIRECTORY_INVALID', 'A non-root campaign directory is required.');
  }
  return Object.freeze({ campaignDir, database: path.join(campaignDir, 'campaign.sqlite'),
    prepared: path.join(campaignDir, 'prepared.json'), seal: path.join(campaignDir, 'seal.json'),
    lock: path.join(campaignDir, 'tick.lock'), objects: path.join(campaignDir, 'objects'),
    exports: path.join(campaignDir, 'exports') });
}

function writeObject(store, collection, value) {
  const serialized = JSON.parse(JSON.stringify(value));
  const digest = fingerprint(serialized);
  const directory = collection === 'export' ? store.exports : store.objects;
  const file = path.join(directory, `${digest}.json`);
  if (fs.existsSync(file)) {
    if (fingerprint(readJson(file)) !== digest) throw failure('SHEV_FIELD_OBJECT_CONFLICT',
      `Content-addressed object ${digest} is corrupted.`);
  } else atomicWrite(file, serialized);
  return { digest, file };
}

function readObject(store, digest) {
  if (!contract.validHash(digest)) throw failure('SHEV_FIELD_STATE_INVALID',
    'Content-addressed object digest is invalid.');
  const file = path.join(store.objects, `${digest}.json`);
  const value = readJson(file);
  if (fingerprint(value) !== digest) throw failure('SHEV_FIELD_OBJECT_CONFLICT',
    `Content-addressed object ${digest} failed verification.`);
  return value;
}

function writePointer(file, payload) {
  if (fs.existsSync(file)) {
    const prior = readJson(file);
    if (fingerprint(prior) !== fingerprint(payload)) throw failure('SHEV_FIELD_STATE_CONFLICT',
      `${path.basename(file)} already identifies different content.`);
    return prior;
  }
  atomicWrite(file, payload);
  return payload;
}

function savePrepared(store, value) {
  const object = writeObject(store, 'object', value);
  return writePointer(store.prepared, { schema: 'genos.shev-field-prepared-pointer/v1',
    objectHash: object.digest });
}

function loadPrepared(store) {
  const pointer = readJson(store.prepared);
  return readObject(store, pointer.objectHash);
}

function saveSeal(store, value) {
  const object = writeObject(store, 'object', value);
  return writePointer(store.seal, { schema: 'genos.shev-field-seal-pointer/v1',
    objectHash: object.digest });
}

function loadSeal(store) {
  const pointer = readJson(store.seal);
  return readObject(store, pointer.objectHash);
}

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

function acquireTickLock(store) {
  fs.mkdirSync(store.campaignDir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = fs.openSync(store.lock, 'wx', 0o600);
      fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }));
      fs.closeSync(handle);
      return () => { if (fs.existsSync(store.lock)) fs.unlinkSync(store.lock); };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = readJson(store.lock);
      if (processAlive(owner.pid)) throw failure('SHEV_FIELD_TICK_BUSY',
        `Another tick is active under process ${owner.pid}.`);
      fs.unlinkSync(store.lock);
    }
  }
  throw failure('SHEV_FIELD_TICK_BUSY', 'Unable to acquire the campaign tick lock.');
}

async function withTickLock(store, action) {
  const release = acquireTickLock(store);
  try { return await action(); } finally { release(); }
}

module.exports = { createStore, readJson, writeObject, savePrepared, loadPrepared,
  saveSeal, loadSeal, withTickLock };
