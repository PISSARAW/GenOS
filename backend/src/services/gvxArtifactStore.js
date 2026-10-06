'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { digest } = require('./gvxVerifierRegistry');
const { error } = require('./gvxContracts');

async function createStore(directory) {
  await fs.mkdir(directory, { recursive: true });
  const root = await fs.realpath(directory);
  return { write: async ({ bytes }) => write(root, bytes),
    read: async ({ artifactRef }) => read(root, artifactRef) };
}

function artifactPath(root, artifactRef) {
  const match = /^gvx-artifact:([a-f0-9]{64})$/.exec(artifactRef || '');
  if (!match) throw error('GVX_ARTIFACT_REFERENCE_INVALID');
  return path.join(root, `${match[1]}.bin`);
}

async function write(root, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 8 * 1024 * 1024) throw error('GVX_ARTIFACT_BYTES_INVALID');
  const artifactRef = `gvx-artifact:${digest(bytes)}`;
  const file = artifactPath(root, artifactRef);
  try { await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 }); }
  catch (failure) { if (failure.code !== 'EEXIST') throw failure; }
  if (!(await read(root, artifactRef)).equals(bytes)) throw error('GVX_ARTIFACT_HASH_MISMATCH');
  return { artifactRef, artifactHash: digest(bytes) };
}

async function read(root, artifactRef) {
  const file = artifactPath(root, artifactRef);
  if ((await fs.lstat(file)).isSymbolicLink()) throw error('GVX_ARTIFACT_LINK_FORBIDDEN');
  const bytes = await fs.readFile(file);
  if (`gvx-artifact:${digest(bytes)}` !== artifactRef) throw error('GVX_ARTIFACT_HASH_MISMATCH');
  return bytes;
}

module.exports = { createStore };
