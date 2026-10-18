'use strict';

const crypto = require('node:crypto');
const nativeFs = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { importWorkspace } = require('../import');
const { blobPath, readBlob, sha256 } = require('../objects');
const { CONTRACT_VERSION } = require('./contract');

const CLONE_FLAGS = nativeFs.constants.COPYFILE_EXCL
  | nativeFs.constants.COPYFILE_FICLONE_FORCE;

function capabilities(available, unavailableReason = null) {
  return {
    available,
    unavailableReason,
    platform: process.platform,
    materialization: 'eager',
    copyGranularity: 'file',
    requiresMount: false,
    portable: false,
    supportsCapture: true,
    supportsRecovery: true
  };
}

function runtime(overrides = {}) {
  return {
    copyFile: overrides.copyFile || fs.copyFile,
    cloneFlags: overrides.cloneFlags === undefined ? CLONE_FLAGS : overrides.cloneFlags
  };
}

function failureReason(error) {
  const code = typeof error.code === 'string' ? error.code.toLowerCase() : 'failed';
  return `reflink_probe_${code}`;
}

async function probeBackend(engine, input = {}) {
  if (typeof input.workspacePath !== 'string' || !input.workspacePath) {
    return capabilities(false, 'workspace_path_required');
  }
  const parent = path.join(path.resolve(input.workspacePath), '.genos', 'gqwf', 'capability-probes');
  await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, 'reflink-'));
  const source = path.join(directory, 'source');
  const target = path.join(directory, 'target');
  const expected = Buffer.from(`gqwf-reflink-${crypto.randomUUID()}`);
  try {
    await fs.writeFile(source, expected, { flag: 'wx' });
    await engine.copyFile(source, target, engine.cloneFlags);
    const actual = await fs.readFile(target);
    return actual.equals(expected)
      ? capabilities(true)
      : capabilities(false, 'reflink_probe_content_mismatch');
  } catch (error) {
    return capabilities(false, failureReason(error));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function cloneFile(engine, input) {
  const source = blobPath(input.workspacePath, input.file.hash);
  const bytes = await readBlob(input.workspacePath, input.file.hash);
  if (bytes.length !== input.file.size) throw new Error('GQWF reflink source size mismatch.');
  const target = path.join(input.destination, ...input.file.path.split('/'));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await engine.copyFile(source, target, engine.cloneFlags);
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error('GQWF reflink target is not a private regular file.');
  }
  const cloned = await fs.readFile(target);
  if (cloned.length !== input.file.size || sha256(cloned) !== input.file.hash) {
    throw new Error('GQWF reflink target integrity check failed.');
  }
  await fs.chmod(target, input.file.mode);
}

async function materialize(engine, input) {
  for (const file of input.manifest.files) {
    await cloneFile(engine, { ...input, file });
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

function createReflinkMaterializer(overrides = {}) {
  const engine = runtime(overrides);
  return {
    id: 'native-reflink-v1',
    contractVersion: CONTRACT_VERSION,
    probe: (input) => probeBackend(engine, input),
    materialize: (input) => materialize(engine, input),
    capture,
    release: remove,
    recover: remove
  };
}

module.exports = createReflinkMaterializer();
module.exports.CLONE_FLAGS = CLONE_FLAGS;
module.exports.createReflinkMaterializer = createReflinkMaterializer;
