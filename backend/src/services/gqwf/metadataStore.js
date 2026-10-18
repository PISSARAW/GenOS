'use strict';

const crypto = require('node:crypto');
const nativeFs = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');

const HASH = /^[a-f0-9]{64}$/;
const REF = /^(\d{12})-([a-f0-9]{64})\.ref$/;

function digest(serialized) {
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function objectPath(workspacePath, hash) {
  if (!HASH.test(hash)) throw new Error('Invalid GQWF metadata object hash.');
  return path.join(workspacePath, '.genos', 'gqwf', 'metadata', 'objects',
    hash.slice(0, 2), hash);
}

function refDirectory(workspacePath) {
  return path.join(workspacePath, '.genos', 'gqwf', 'metadata', 'refs', 'catalog');
}

async function privateFile(target) {
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error('GQWF metadata object is not a private regular file.');
  }
  return stat;
}

async function readObject(workspacePath, hash) {
  const target = objectPath(workspacePath, hash);
  await privateFile(target);
  const serialized = await fs.readFile(target, 'utf8');
  if (digest(serialized) !== hash) throw new Error('GQWF metadata object integrity check failed.');
  return serialized;
}

async function reuseObject(target, serialized, hash) {
  try {
    await privateFile(target);
    const existing = await fs.readFile(target, 'utf8');
    if (digest(existing) !== hash || existing !== serialized) {
      throw new Error('GQWF metadata object collision or corruption.');
    }
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

async function putObject(workspacePath, serialized) {
  if (typeof serialized !== 'string') throw new TypeError('GQWF metadata object must be serialized text.');
  const hash = digest(serialized);
  const target = objectPath(workspacePath, hash);
  if (await reuseObject(target, serialized, hash)) return hash;
  await fs.mkdir(path.dirname(target), { recursive: true });
  const staging = path.join(path.dirname(target), `.metadata-${crypto.randomUUID()}.tmp`);
  const handle = await fs.open(staging, 'wx');
  try {
    await handle.writeFile(serialized);
    await handle.sync();
  } finally { await handle.close(); }
  try {
    await fs.rename(staging, target);
  } catch (error) {
    if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error;
    try {
      await fs.copyFile(staging, target, nativeFs.constants.COPYFILE_EXCL);
    } catch (copyError) {
      if (copyError.code !== 'EEXIST') throw copyError;
    }
  } finally { await fs.rm(staging, { force: true }); }
  await reuseObject(target, serialized, hash);
  return hash;
}

function refName(revision, hash) {
  if (!Number.isSafeInteger(revision) || revision < 1 || revision > 999999999999) {
    throw new Error('Invalid GQWF metadata catalog revision.');
  }
  return `${String(revision).padStart(12, '0')}-${hash}.ref`;
}

async function writeRef(workspacePath, value) {
  const directory = refDirectory(workspacePath);
  await fs.mkdir(directory, { recursive: true });
  const target = path.join(directory, refName(value.revision, value.catalogHash));
  const serialized = JSON.stringify(value);
  await fs.writeFile(target, serialized, { flag: 'wx' });
  return target;
}

function parseRefName(name) {
  const match = REF.exec(name);
  return match ? { revision: Number(match[1]), catalogHash: match[2] } : null;
}

async function latestRef(workspacePath) {
  const directory = refDirectory(workspacePath);
  let names;
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const refs = names.map(parseRefName).filter(Boolean)
    .sort((left, right) => right.revision - left.revision
      || right.catalogHash.localeCompare(left.catalogHash));
  if (!refs.length) return null;
  const highest = refs.filter((entry) => entry.revision === refs[0].revision);
  if (highest.length !== 1) throw new Error('GQWF metadata catalog has a forked latest ref.');
  const selected = highest[0];
  const target = path.join(directory, refName(selected.revision, selected.catalogHash));
  await privateFile(target);
  const stored = JSON.parse(await fs.readFile(target, 'utf8'));
  if (stored.protocol !== 'gqwf-catalog-ref-v1'
    || stored.revision !== selected.revision || stored.catalogHash !== selected.catalogHash) {
    throw new Error('GQWF metadata catalog ref integrity check failed.');
  }
  return stored;
}

module.exports = { digest, latestRef, objectPath, putObject, readObject, writeRef };
