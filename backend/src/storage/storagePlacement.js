'use strict';

const fs = require('fs');
const path = require('path');
const { discoverVolumes, inspectVolume } = require('../services/hostEnvironment');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_ROOT = path.join(REPO_ROOT, '.genos', 'data');
const POINTER = path.join(REPO_ROOT, '.genos', 'storage-location.json');

function existingAncestor(candidate) {
  let current = path.resolve(candidate);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return fs.statSync(current).isDirectory() ? current : null;
}

function validCandidate(candidate) {
  if (!path.isAbsolute(candidate)) return null;
  const resolved = path.resolve(candidate);
  const ancestor = existingAncestor(resolved);
  if (!ancestor) return null;
  try { fs.accessSync(ancestor, fs.constants.W_OK); } catch (_) { return null; }
  const volume = inspectVolume(ancestor);
  return volume ? { root: resolved, volume } : null;
}

function readPinnedRoot() {
  try {
    const record = JSON.parse(fs.readFileSync(POINTER, 'utf8'));
    return record.version === 1 && fs.existsSync(record.root) && validCandidate(record.root)
      ? path.resolve(record.root) : null;
  } catch (_) {
    return null;
  }
}

function candidateRoots(environment) {
  const configured = String(environment.GENOS_STORAGE_CANDIDATES || '').trim();
  if (configured) return configured.split(path.delimiter);
  return discoverVolumes().map((volume) => path.join(volume.path, 'GenOS', 'data'));
}

function selectCandidate(environment) {
  const candidates = [DEFAULT_ROOT, ...candidateRoots(environment)]
    .map((item) => item.trim()).filter(Boolean).map(validCandidate).filter(Boolean);
  const configuredMinimum = Number(environment.GENOS_STORAGE_MIN_FREE_BYTES);
  const minimumFreeBytes = Number.isFinite(configuredMinimum) && configuredMinimum > 0
    ? configuredMinimum : 1024 ** 3;
  const eligible = candidates.filter((item) => item.volume.availableBytes >= minimumFreeBytes);
  eligible.sort((left, right) => right.volume.freeRatio - left.volume.freeRatio ||
    right.volume.availableBytes - left.volume.availableBytes);
  return eligible[0] || null;
}

function explicitDataRoot(value) {
  const candidate = validCandidate(value);
  if (!candidate) throw new Error('GENOS_DATA_ROOT must be an accessible absolute directory path.');
  const pinned = readPinnedRoot();
  if (pinned && pinned !== candidate.root) throw new Error('GENOS_DATA_ROOT conflicts with the pinned data location.');
  if (!pinned && fs.existsSync(DEFAULT_ROOT) && candidate.root !== DEFAULT_ROOT) {
    throw new Error('Existing GenOS data requires an offline migration before changing GENOS_DATA_ROOT.');
  }
  return { root: candidate.root, reason: 'explicit' };
}

function chooseDataRoot(environment = process.env) {
  const explicit = String(environment.GENOS_DATA_ROOT || '').trim();
  if (explicit) return explicitDataRoot(explicit);
  const pinned = readPinnedRoot();
  if (pinned) return { root: pinned, reason: 'pinned' };
  if (fs.existsSync(POINTER)) throw new Error('GenOS storage location is invalid or unavailable; refusing to start with an empty data root.');
  if (fs.existsSync(DEFAULT_ROOT)) return { root: DEFAULT_ROOT, reason: 'existing' };
  const selected = selectCandidate(environment);
  return selected ? { root: selected.root, reason: 'selected' }
    : { root: DEFAULT_ROOT, reason: 'default' };
}

function pinDataRoot(selection) {
  if (selection.reason !== 'selected' && selection.reason !== 'explicit') return;
  fs.mkdirSync(selection.root, { recursive: true });
  fs.mkdirSync(path.dirname(POINTER), { recursive: true });
  try {
    fs.writeFileSync(POINTER, JSON.stringify({ version: 1, root: selection.root }) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pinned = readPinnedRoot();
    if (pinned !== selection.root) throw new Error('Another process selected a different GenOS data root.');
  }
}

module.exports = { chooseDataRoot, pinDataRoot, selectCandidate, DEFAULT_ROOT };
