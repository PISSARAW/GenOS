'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const daemon = require('./daemonObservationContract');

function read(root, source) {
  const file = require('../pathSafety').resolveContainedPathNoSymlinkSync(root, source.path, 'daemon observation source');
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 32768) throw new Error('DAEMON_INPUT_OUT_OF_BOUNDS');
  const bytes = fs.readFileSync(file);
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== source.sha256) {
    throw new Error('DAEMON_INPUT_SOURCE_CHANGED');
  }
  return { path: source.path, sourceRef: `sha256:${source.sha256}`, content: bytes.toString('utf8') };
}

function indexedView(sources, assigned) {
  try {
    const problem = JSON.parse(sources.find(source => source.path === assigned.files.problem).content.replace(/^\uFEFF/, ''));
    const allocation = JSON.parse(sources.find(source => source.path === assigned.files.allocation).content.replace(/^\uFEFF/, ''));
    if (!Array.isArray(problem.values) || problem.values.length > 24
      || !problem.values.every(Number.isSafeInteger) || !Array.isArray(allocation.indices)
      || allocation.indices.length > 24 || !allocation.indices.every(Number.isSafeInteger)
      || !Number.isSafeInteger(problem.target)) return null;
    return { indexedValues: problem.values.map((value, index) => ({ index, value })),
      allocationIndices: allocation.indices, target: problem.target,
      sources: sources.map(({ path, sourceRef }) => ({ path, sourceRef })) };
  } catch (_) { return null; }
}

function context(mission) {
  if (!daemon.responseFormat(mission.workerContract)) return '';
  const assigned = mission.workerContract.assignment.workspaceVerificationContract;
  const files = new Set([assigned.files.problem, assigned.files.allocation]);
  const sources = assigned.sources.filter(source => files.has(source.path)).map(source => read(mission.workspaceRoot, source));
  const view = indexedView(sources, assigned);
  if (!view) return '\nCurrent allocation input cannot be indexed; inspect the raw sources and report any invalid or missing input.';
  return '\nCURRENT_ALLOCATION_INPUT_JSON (index labels for the sealed source values; no computed observation)\n'
    + JSON.stringify(view) + '\nSelect by the explicit index labels in allocationIndices, add the selected values, '
    + 'then compare with target using the typed observation contract. This view is data, not proof of a result.';
}

module.exports = { context };
