'use strict';

const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { resolveWorkspaceRoot, resolveContainedPathNoSymlinkSync,
  normalizeRelativePath } = require('../../pathSafety');
const { FORBIDDEN } = require('../../ontogenesis/integrationService');
const { recordObservation } = require('../observationService');
const { recordProjectEffect } = require('../effectService');

const HASH = /^[a-f0-9]{64}$/;

function validPointer(pointer) {
  return typeof pointer === 'string' && (pointer === '' || (pointer.startsWith('/') && pointer.length <= 256));
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function pointerValue(document, pointer) {
  if (pointer === '') return document;
  if (!pointer.startsWith('/') || pointer.length > 256) throw new TypeError('SHEV JSON pointer is invalid.');
  return pointer.slice(1).split('/').reduce((value, token) => {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    return value && Object.hasOwn(value, key) ? value[key] : undefined;
  }, document);
}

function inspect(path, input) {
  let raw;
  try { raw = fs.readFileSync(path); } catch (error) {
    if (error.code === 'ENOENT') return { kind: 'blind_spot', epistemicStatus: 'unknown',
      summary: 'Le contrat JSON attendu est absent.', evidenceRefs: [], fingerprint: 'missing' };
    throw error;
  }
  if (raw.length > 1048576 || !fs.statSync(path).isFile()) throw new Error('SHEV JSON source is too large or irregular.');
  const fileHash = digest(raw);
  let value;
  try { value = pointerValue(JSON.parse(raw.toString('utf8')), input.pointer); } catch (_) {
    return { kind: 'degradation', epistemicStatus: 'observed', summary: 'Le document JSON est invalide.',
      evidenceRefs: [`file:sha256:${fileHash}`], fingerprint: fileHash };
  }
  const valid = value !== undefined && digest(JSON.stringify(value)) === input.expectedSha256;
  return { kind: valid ? 'state' : 'degradation', epistemicStatus: 'observed',
    summary: valid ? 'Le contrat JSON est satisfait.' : 'Le contrat JSON est viole.',
    evidenceRefs: [`file:sha256:${fileHash}`], fingerprint: fileHash };
}

async function inspectJsonContract(db, input) {
  if (!input?.projectId || !input.dimension || !HASH.test(input.expectedSha256)
    || !validPointer(input.pointer)) throw new TypeError('SHEV JSON contract is invalid.');
  const relativePath = normalizeRelativePath(input.relativePath, 'JSON source');
  if (FORBIDDEN.some((pattern) => pattern.test(relativePath))) throw new Error('SHEV JSON source is forbidden.');
  const project = await db.get('SELECT root_path FROM ontogenesis_projects WHERE id = ?', [input.projectId]);
  if (!project) throw new Error('SHEV project does not exist.');
  const root = resolveWorkspaceRoot(project.root_path);
  const path = resolveContainedPathNoSymlinkSync(root, relativePath, 'JSON source');
  const result = inspect(path, input);
  const identity = [input.projectId, relativePath, input.pointer, input.expectedSha256, result.fingerprint].join('\0');
  const id = `json_contract_${digest(identity)}`;
  const existing = await db.get(`SELECT observed_at FROM shev_observations
    WHERE project_id = ? AND id = ?`, [input.projectId, id]);
  if (existing) return { ...result, id, replayed: true, observedAt: existing.observed_at };
  return recordObservation(db, { id, projectId: input.projectId, domain: 'application-contract',
    dimension: input.dimension, source: `json-contract:${digest(relativePath + input.pointer)}`,
    observedAt: new Date(input.nowMs ?? Date.now()).toISOString(), kind: result.kind,
    epistemicStatus: result.epistemicStatus, summary: result.summary,
    evidenceRefs: result.evidenceRefs });
}

async function verifyJsonContract(db, input) {
  const after = await inspectJsonContract(db, input);
  return recordProjectEffect(db, { projectId: input.projectId,
    initiativeId: input.initiativeId, postObservationId: after.id,
    verify: async () => ({ result: after.kind === 'state' ? 'confirmed' : 'regressed',
      verifierRef: 'shev:json-contract:v1', evidenceRefs: after.evidenceRefs }) });
}

module.exports = { inspectJsonContract, verifyJsonContract };
