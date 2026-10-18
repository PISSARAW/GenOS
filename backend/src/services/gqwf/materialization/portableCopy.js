'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { importWorkspace } = require('../import');
const { readBlob } = require('../objects');
const { CONTRACT_VERSION } = require('./contract');

async function probe() {
  return {
    available: true,
    platform: process.platform,
    materialization: 'eager',
    copyGranularity: 'none',
    requiresMount: false,
    portable: true,
    supportsCapture: true,
    supportsRecovery: true
  };
}

async function materialize(input) {
  for (const file of input.manifest.files) {
    const target = path.join(input.destination, ...file.path.split('/'));
    const bytes = await readBlob(input.workspacePath, file.hash);
    if (bytes.length !== file.size) throw new Error('GQWF materialization file size mismatch.');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: 'wx' });
    await fs.chmod(target, file.mode);
  }
  return { path: input.destination };
}

async function capture(input) {
  return importWorkspace(input.sourcePath, input.objectWorkspacePath);
}

async function remove(input) {
  await fs.rm(input.path, { recursive: true, force: true });
  return { released: true };
}

module.exports = {
  id: 'portable-copy-v1',
  contractVersion: CONTRACT_VERSION,
  probe,
  materialize,
  capture,
  release: remove,
  recover: remove
};
