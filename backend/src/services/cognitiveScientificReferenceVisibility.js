'use strict';

const { createHash, randomUUID } = require('node:crypto');
const visibilityLedger = require('./cognitivePersistentVisibilityLedger');
const { formatReference, parseReference } = require('./scientificReferences');
const { withTransaction } = require('../db');

const PREFIX = 'genos-science://reference/';
const SCOPE_FIELDS = ['organizationId', 'projectId', 'workspaceId'];
const MAX_CONTENT_BYTES = 64 * 1024;

function failure(reason) { return { status: 'blocked', reason }; }

function scopeField(context, nested, field) {
  if (context[field] && nested[field] && context[field] !== nested[field]) {
    throw new Error('scientific_scope_conflict');
  }
  const value = context[field] || nested[field];
  if (typeof value !== 'string' || !value.trim()) throw new Error('scientific_scope_required');
  return value;
}

function requesterScope(context = {}) {
  const nested = typeof context.cognitiveScope === 'object' && context.cognitiveScope !== null
    ? context.cognitiveScope : {};
  if (Array.isArray(nested)) throw new Error('scientific_scope_required');
  const scope = {};
  for (const field of SCOPE_FIELDS) {
    scope[field] = scopeField(context, nested, field);
  }
  return scope;
}

function validResolution(resolved, ref) {
  return resolved?.status === 'resolved' && resolved.version === ref.version &&
    typeof resolved.content === 'string' && resolved.ref &&
    formatReference(resolved.ref) === formatReference(ref);
}

function visibleValue(resolved, ref) {
  if (!validResolution(resolved, ref)) {
    throw new Error('scientific_resolution_invalid');
  }
  const bytes = Buffer.from(resolved.content, 'utf8');
  if (bytes.length > MAX_CONTENT_BYTES) throw new Error('scientific_content_too_large');
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (digest !== resolved.digest) throw new Error('scientific_content_digest_mismatch');
  return { ref, version: ref.version, content: resolved.content, digest, bytes: bytes.length };
}

function visibilityScope(scope) {
  const hash = createHash('sha256').update(JSON.stringify(scope)).digest('hex');
  return `scientific:${hash}`;
}

async function read(operation, state) {
  const context = state.context || {};
  if (!context.db || typeof context.db.run !== 'function' || typeof context.db.exec !== 'function' || !context.sessionId ||
      typeof context.scientificReferenceStore?.resolveReference !== 'function') {
    return failure('scientific_runtime_unavailable');
  }
  try {
    const ref = parseReference(operation.reference);
    const scope = requesterScope(context);
    const { value, visibility } = await persistVisible({ context, uri: operation.reference, ref, scope });
    state.values[operation.id] = value;
    return { status: 'ready', value, visibility };
  } catch (error) {
    delete state.values[operation.id];
    return failure(error.code?.startsWith('SCI_REF_') ? error.code :
      error.message?.startsWith('scientific_') ? error.message : 'scientific_read_failed');
  }
}

async function persistVisible({ context, uri, ref, scope }) {
  return withTransaction(context.db, () => persistWithinSavepoint({ context, uri, ref, scope }));
}

async function persistWithinSavepoint({ context, uri, ref, scope }) {
  const savepoint = `gcir_science_${randomUUID().replace(/-/g, '')}`;
  await context.db.exec(`SAVEPOINT ${savepoint}`);
  try {
    const resolved = await context.scientificReferenceStore.resolveReference(context.db,
      { ref, requesterScope: scope });
    const value = visibleValue(resolved, ref);
    const visibility = await visibilityLedger.materialize(context.db, {
      sessionId: context.sessionId, objectId: uri, value, scope: visibilityScope(scope)
    });
    await context.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    return { value, visibility };
  } catch (error) {
    await context.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}`);
    throw error;
  }
}

async function invalidateReference(db, input = {}) {
  parseReference(input.uri);
  await visibilityLedger.ensureSchema(db);
  const sessions = await db.all(`SELECT DISTINCT session_id FROM cognitive_visibility_fragments
    WHERE object_id = ? AND valid = 1`, input.uri);
  for (const row of sessions) {
    await visibilityLedger.invalidate(db, { sessionId: row.session_id,
      objectIds: [input.uri], reason: input.reason || 'scientific_reference_retracted' });
  }
  return { status: 'invalidated', uri: input.uri, sessionIds: sessions.map((row) => row.session_id) };
}

module.exports = { PREFIX, formatReference, parseReference, read, invalidateReference };
