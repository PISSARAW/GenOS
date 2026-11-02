'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const MAX_BLOB_BYTES = 8 * 1024 * 1024;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;

function samePath(left, right) {
  const normalize = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
  return normalize(path.resolve(left)) === normalize(path.resolve(right));
}

async function directory(location) {
  const stat = await fs.lstat(location);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await fs.realpath(location), location)) {
    throw new Error('GQWF Exchange CAS parent is linked or unsafe.');
  }
  return `${stat.dev}:${stat.ino}`;
}

async function parents(root, parts) {
  const identities = [await directory(root)];
  let current = root;
  for (const part of parts) {
    if (!/^(?:\.genos|gqwf|blobs|metadata|objects|refs|catalog|[a-f0-9]{2})$/.test(part)) throw new Error('GQWF Exchange unsafe CAS component.');
    current = path.join(current, part);
    try { await fs.mkdir(current, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    identities.push(await directory(current));
  }
  return identities;
}

async function privateFile(target, maximum) {
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > maximum) {
    throw new Error('GQWF Exchange CAS leaf is not a bounded private regular file.');
  }
  return stat;
}

function decodeBase64(serialized) {
  if (typeof serialized !== 'string' || serialized.length > Math.ceil(MAX_BLOB_BYTES / 3) * 4) {
    throw new Error('GQWF Exchange transfer exceeds blob byte bound.');
  }
  const bytes = Buffer.from(serialized, 'base64');
  if (bytes.length > MAX_BLOB_BYTES || bytes.toString('base64') !== serialized) throw new Error('GQWF Exchange base64 is not canonical.');
  return bytes;
}

module.exports = { MAX_BLOB_BYTES, MAX_METADATA_BYTES, samePath, directory, parents, privateFile, decodeBase64 };
