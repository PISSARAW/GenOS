'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { importWorkspace } = require('../import');
const { readBlob, sha256 } = require('../objects');
const { CONTRACT_VERSION } = require('./contract');
const { createRuntime } = require('./overlayfsRuntime');

function capabilities(engine, available, unavailableReason = null) {
  return {
    available,
    unavailableReason,
    platform: engine.platform,
    materialization: 'lazy',
    copyGranularity: 'file',
    requiresMount: true,
    portable: false,
    supportsCapture: true,
    supportsRecovery: true
  };
}

function errorReason(prefix, error) {
  const code = typeof error?.code === 'string' ? error.code.toLowerCase() : 'failed';
  return `${prefix}_${code}`;
}

function safeMountPaths(paths) {
  const unsafe = process.platform === 'win32' ? /[\r\n,]/ : /[\\\r\n,:]/;
  return paths.every((value) => typeof value === 'string' && value.length > 0
    && !unsafe.test(value));
}

async function cleanupProbe(engine, state) {
  if (state.mounted || await engine.isMounted(state.merged)) {
    await engine.unmount(state.merged);
  }
  if (await engine.isMounted(state.merged)) throw new Error('OverlayFS probe remained mounted.');
  await fs.rm(state.directory, { recursive: true, force: true });
}

async function runProbe(engine, state) {
  const source = path.join(state.lower, 'source');
  await fs.writeFile(source, 'lower', { flag: 'wx' });
  await engine.mount(state);
  state.mounted = true;
  if (await fs.readFile(path.join(state.merged, 'source'), 'utf8') !== 'lower') {
    throw new Error('OverlayFS probe read mismatch.');
  }
  await fs.writeFile(path.join(state.merged, 'source'), 'upper');
  if (await fs.readFile(source, 'utf8') !== 'lower') {
    throw new Error('OverlayFS probe changed its lower layer.');
  }
}

async function probeBackend(engine, input = {}) {
  if (engine.platform !== 'linux') {
    return capabilities(engine, false, `overlayfs_platform_${engine.platform}`);
  }
  if (!safeMountPaths([input.workspacePath])) {
    return capabilities(engine, false, 'overlayfs_workspace_path_unsupported');
  }
  const parent = path.join(path.resolve(input.workspacePath), '.genos', 'gqwf',
    'capability-probes');
  await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, 'overlayfs-'));
  const state = { directory, lower: path.join(directory, 'lower'),
    upper: path.join(directory, 'upper'), work: path.join(directory, 'work'),
    merged: path.join(directory, 'merged'), mounted: false };
  await Promise.all([state.lower, state.upper, state.work, state.merged]
    .map((entry) => fs.mkdir(entry)));
  let result = capabilities(engine, true);
  try {
    await runProbe(engine, state);
  } catch (error) {
    result = capabilities(engine, false, errorReason('overlayfs_probe', error));
  }
  try {
    await cleanupProbe(engine, state);
  } catch (error) {
    return capabilities(engine, false, errorReason('overlayfs_probe_unmount', error));
  }
  return result;
}

function lowerLocation(workspacePath, rootHash) {
  if (!/^[a-f0-9]{64}$/.test(rootHash || '')) throw new Error('Invalid GQWF OverlayFS root hash.');
  return path.join(workspacePath, '.genos', 'gqwf', 'overlay-lower', rootHash);
}

async function validateLower(input) {
  const target = lowerLocation(input.workspacePath, input.rootHash);
  const root = path.join(target, 'root');
  await assertManagedDirectory(target);
  await assertManagedDirectory(root);
  await assertReady(target, input.rootHash);
  const tree = expectedTree(input.manifest);
  await visitLowerTree(tree, { absolute: root, relative: '' });
  if (tree.files.size || tree.directories.size) {
    throw new Error('GQWF OverlayFS lower cache is incomplete.');
  }
  return root;
}

async function assertManagedDirectory(location) {
  const stat = await fs.lstat(location);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('GQWF OverlayFS lower cache lacks ownership proof.');
  }
}

async function assertReady(target, rootHash) {
  const readyPath = path.join(target, '.ready');
  const stat = await fs.lstat(readyPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
    || await fs.readFile(readyPath, 'utf8') !== rootHash) {
    throw new Error('GQWF OverlayFS lower cache lacks ownership proof.');
  }
}

function expectedTree(manifest) {
  const files = new Map(manifest.files.map((file) => [file.path, file]));
  const directories = new Set();
  for (const file of manifest.files) {
    const segments = file.path.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join('/'));
    }
  }
  return { files, directories };
}

async function visitLowerTree(tree, location) {
  const entries = await fs.readdir(location.absolute, { withFileTypes: true });
  for (const entry of entries) {
    const relative = location.relative ? `${location.relative}/${entry.name}` : entry.name;
    const absolute = path.join(location.absolute, entry.name);
    if (entry.isDirectory() && tree.directories.delete(relative)) {
      await visitLowerTree(tree, { absolute, relative });
    } else if (entry.isFile() && tree.files.has(relative)) {
      await validateLowerFile(tree.files.get(relative), absolute);
      tree.files.delete(relative);
    } else {
      throw new Error('GQWF OverlayFS lower cache contains an unexpected entry.');
    }
  }
}

async function validateLowerFile(file, location) {
  const stat = await fs.lstat(location);
  const bytes = await fs.readFile(location);
  const modeChanged = process.platform !== 'win32' && (stat.mode & 0o777) !== file.mode;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
    || modeChanged || bytes.length !== file.size || sha256(bytes) !== file.hash) {
    throw new Error('GQWF OverlayFS lower cache integrity check failed.');
  }
}

async function buildLower(input, staging) {
  const root = path.join(staging, 'root');
  await fs.mkdir(root);
  for (const file of input.manifest.files) {
    const target = path.join(root, ...file.path.split('/'));
    const bytes = await readBlob(input.workspacePath, file.hash);
    if (bytes.length !== file.size) throw new Error('GQWF OverlayFS lower size mismatch.');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: 'wx' });
    await fs.chmod(target, file.mode);
  }
  await fs.writeFile(path.join(staging, '.ready'), input.rootHash, { flag: 'wx' });
}

async function ensureLower(input) {
  const target = lowerLocation(input.workspacePath, input.rootHash);
  try {
    return await validateLower(input);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const parent = path.dirname(target);
  await fs.mkdir(parent, { recursive: true });
  const staging = await fs.mkdtemp(path.join(parent, `.staging-${input.rootHash}-`));
  try {
    await buildLower(input, staging);
    try {
      await fs.rename(staging, target);
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error;
    }
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
  return validateLower(input);
}

async function materialize(engine, input) {
  if (!safeMountPaths([input.containerPath, input.destination])) {
    throw new Error('GQWF OverlayFS lease path is unsupported.');
  }
  const lower = await ensureLower(input);
  const upper = path.join(input.containerPath, 'upper');
  const work = path.join(input.containerPath, 'work');
  await Promise.all([fs.mkdir(upper), fs.mkdir(work)]);
  await engine.mount({ lower, upper, work, merged: input.destination });
  if (!await engine.isMounted(input.destination)) {
    throw new Error('GQWF OverlayFS mount was not observed.');
  }
  return { path: input.destination };
}

async function capture(input) {
  await validateLower(input);
  return importWorkspace(input.sourcePath, input.objectWorkspacePath);
}

async function remove(engine, input) {
  if (await engine.isMounted(input.executionPath)) await engine.unmount(input.executionPath);
  if (await engine.isMounted(input.executionPath)) {
    throw new Error('GQWF OverlayFS execution root remains mounted.');
  }
  await fs.rm(input.path, { recursive: true, force: true });
  return { released: true };
}

function createOverlayfsMaterializer(overrides = {}) {
  const engine = createRuntime(overrides);
  return {
    id: 'linux-overlayfs-v1',
    contractVersion: CONTRACT_VERSION,
    probe: (input) => probeBackend(engine, input),
    materialize: (input) => materialize(engine, input),
    capture,
    release: (input) => remove(engine, input),
    recover: (input) => remove(engine, input)
  };
}

module.exports = createOverlayfsMaterializer();
module.exports.createOverlayfsMaterializer = createOverlayfsMaterializer;
