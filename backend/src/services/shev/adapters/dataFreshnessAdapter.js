'use strict';

const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { resolveWorkspaceRoot, resolveContainedPathNoSymlinkSync,
  normalizeRelativePath } = require('../../pathSafety');
const { FORBIDDEN } = require('../../ontogenesis/integrationService');
const { recordObservation } = require('../observationService');

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function inspectFile(path) {
  try {
    const stat = fs.statSync(path);
    if (!stat.isFile()) throw new Error('SHEV data source is not a regular file.');
    return { exists: true, modifiedAtMs: stat.mtimeMs, changedAtMs: stat.ctimeMs, size: stat.size };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false };
    throw error;
  }
}

function classify(file, nowMs, maxAgeMs) {
  if (!file.exists) return { kind: 'blind_spot', epistemicStatus: 'unknown',
    summary: 'Le fichier attendu est absent.', validUntil: null, evidenceRefs: [] };
  const stale = nowMs - file.modifiedAtMs > maxAgeMs;
  const evidenceRef = `file-metadata:sha256:${digest(`${file.modifiedAtMs}\0${file.changedAtMs}\0${file.size}`)}`;
  return { kind: stale ? 'degradation' : 'state', epistemicStatus: 'observed',
    summary: stale ? 'La fraicheur du fichier depasse le seuil delegue.' : 'Le fichier satisfait le seuil de fraicheur.',
    validUntil: stale ? null : new Date(file.modifiedAtMs + maxAgeMs).toISOString(),
    evidenceRefs: [evidenceRef] };
}

function observationId(input, file, classification) {
  const identity = [input.projectId, input.relativePath, input.dimension,
    input.maxAgeMs, file.exists ? file.modifiedAtMs : 'missing',
    file.exists ? file.changedAtMs : 0, file.exists ? file.size : 0, classification.kind].join('\0');
  return `data_freshness_${digest(identity)}`;
}

async function inspectDataFreshness(db, input) {
  if (!input?.projectId || !input.dimension || !Number.isSafeInteger(input.maxAgeMs)
    || input.maxAgeMs <= 0) throw new TypeError('SHEV freshness check requires a positive threshold.');
  const relativePath = normalizeRelativePath(input.relativePath, 'data source');
  if (FORBIDDEN.some((pattern) => pattern.test(relativePath))) throw new Error('SHEV data source is forbidden.');
  const project = await db.get('SELECT root_path FROM ontogenesis_projects WHERE id = ?', [input.projectId]);
  if (!project) throw new Error('SHEV project does not exist.');
  const root = resolveWorkspaceRoot(project.root_path);
  const path = resolveContainedPathNoSymlinkSync(root, relativePath, 'data source');
  const file = inspectFile(path);
  const nowMs = input.nowMs ?? Date.now();
  const classification = classify(file, nowMs, input.maxAgeMs);
  const id = observationId({ ...input, relativePath }, file, classification);
  const existing = await db.get('SELECT observed_at FROM shev_observations WHERE project_id = ? AND id = ?', [input.projectId, id]);
  if (existing) return { id, projectId: input.projectId, domain: 'data-pipeline',
    dimension: input.dimension, source: `file:${relativePath}`, observedAt: existing.observed_at,
    replayed: true, ...classification };
  return recordObservation(db, { id, projectId: input.projectId, domain: 'data-pipeline',
    dimension: input.dimension, source: `file:${relativePath}`,
    observedAt: new Date(nowMs).toISOString(), ...classification });
}

module.exports = { inspectDataFreshness };
