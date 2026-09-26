'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');

const SECTION_ROLES = new Set(['overview', 'requirements', 'evidence', 'decision', 'appendix']);
const BLOCK_TYPES = new Set(['paragraph', 'heading', 'code', 'list', 'quote', 'table']);

function createDocumentVariantService(syncytium) {
  return {
    createDocumentSession: (mission, options) => createSession(mission, options, syncytium),
    insertDocumentBlock: (sessionId, request) => insertBlock(sessionId, request, syncytium),
    deleteDocumentBlock: (sessionId, request) => deleteBlock(sessionId, request, syncytium),
    addDocumentComment: (sessionId, request) => addComment(sessionId, request, syncytium),
    undoDocumentOperation: (sessionId, request) => undoOperation(sessionId, request, syncytium),
    documentSnapshot: (sessionId, options) => readSnapshot(sessionId, options, syncytium)
  };
}

function createSession(mission, options = {}, syncytium) {
  return syncytium.createSession(mission, { ...options, schema: schemaService.compile({
    schemaId: 'syncytium-document-v1', fields: {
      sections: { dataType: 'SEQUENCE', consistencyZone: 'CAUSAL' },
      comments: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' },
      document_undo: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' }
    }, schemaVersion: options.schemaVersion || 1
  }) });
}

async function insertBlock(sessionId, request = {}, syncytium) {
  const snapshot = await readSnapshot(sessionId, request.options, syncytium);
  validateSchemaVersion(snapshot, request);
  const block = createBlock(request, snapshot);
  return syncytium.applyOperation(sessionId, {
    opId: request.opId || randomUUID(), actorId: request.actorId,
    kind: { type: 'typed_field', key: 'sections', action: 'insert', elementId: block.blockId, afterId: request.afterId || null, value: block }
  }, request.options || {});
}

function createBlock(request, snapshot) {
  validateIdentity(request);
  if (!request.sectionId || !BLOCK_TYPES.has(request.blockType) || typeof request.text !== 'string') {
    throw documentError('A document block requires sectionId, a supported blockType and text.');
  }
  validateSectionRole(request.semanticRole);
  validateMarks(request.marks || [], request.text.length);
  return { blockId: request.blockId || randomUUID(), sectionId: request.sectionId,
    semanticRole: request.semanticRole || 'overview', blockType: request.blockType, text: request.text,
    marks: request.marks || [], attribution: attribution(request), intent: request.intent || 'edit_document_content',
    schemaVersion: snapshot.schema.schemaVersion };
}

async function deleteBlock(sessionId, request = {}, syncytium) {
  validateIdentity(request);
  if (!request.blockId) throw documentError('Deleting a document block requires blockId.');
  const snapshot = await readSnapshot(sessionId, request.options, syncytium);
  validateSchemaVersion(snapshot, request);
  const exists = snapshot.shared.sharedFields.sections.some((block) => block.blockId === request.blockId);
  if (!exists) throw documentError('The document block does not exist.');
  return syncytium.applyOperation(sessionId, {
    opId: request.opId || randomUUID(), actorId: request.actorId,
    kind: { type: 'typed_field', key: 'sections', action: 'delete', elementId: request.blockId }
  }, request.options || {});
}

async function addComment(sessionId, request = {}, syncytium) {
  validateIdentity(request);
  if (!request.commentId || !request.blockId || typeof request.text !== 'string' || !request.text.trim()) {
    throw documentError('A document comment requires commentId, blockId and non-empty text.');
  }
  const snapshot = await readSnapshot(sessionId, request.options, syncytium);
  validateSchemaVersion(snapshot, request);
  if (!snapshot.shared.sharedFields.sections.some((block) => block.blockId === request.blockId)) {
    throw documentError('A document comment must target an existing block.');
  }
  return syncytium.applyOperation(sessionId, {
    opId: request.opId || randomUUID(), actorId: request.actorId,
    kind: { type: 'typed_field', key: 'comments', action: 'add', value: {
      commentId: request.commentId, blockId: request.blockId, text: request.text,
      attribution: attribution(request), createdAt: Date.now()
    } }
  }, request.options || {});
}

async function undoOperation(sessionId, request = {}, syncytium) {
  validateIdentity(request);
  if (!request.operationId || !request.undoId) throw documentError('Undo requires operationId and undoId.');
  const [snapshot, history] = await Promise.all([
    readSnapshot(sessionId, request.options, syncytium), syncytium.inspectHistory(sessionId, request.options || {})
  ]);
  const compensation = validateAndBuildCompensation(snapshot, history.operations, request);
  const now = Date.now();
  const audit = { undoId: request.undoId, undoOf: request.operationId, actorId: request.actorId,
    intent: request.intent || 'preserve_author_intent', createdAt: now, compensation: compensation.kind.action };
  return syncytium.applyTransaction(sessionId, {
    txId: request.txId || randomUUID(), operations: [
      { ...compensation, opId: request.opId || randomUUID(), actorId: request.actorId },
      { opId: request.auditOpId || randomUUID(), actorId: request.actorId,
        kind: { type: 'typed_field', key: 'document_undo', action: 'add', value: audit } }
    ], preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE'
  }, request.options || {});
}

function validateAndBuildCompensation(snapshot, operations, request) {
  validateSchemaVersion(snapshot, request);
  const original = operations.find((operation) => operation.opId === request.operationId);
  if (!original || original.kind?.key !== 'sections') throw documentError('Undo can only target an existing document sequence operation.');
  const previousUndo = snapshot.shared.sharedFields.document_undo.some((item) => item.undoOf === request.operationId);
  if (previousUndo) throw documentError('This document operation already has a compensating edit.');
  return compensationFor(original, request, operations);
}

function compensationFor(original, request, history) {
  if (original.kind.action === 'insert') return {
    kind: { type: 'typed_field', key: 'sections', action: 'delete', elementId: original.kind.elementId }
  };
  if (original.kind.action !== 'delete') throw documentError('The document operation has no supported inverse.');
  const priorInsert = history.find((operation) => operation.kind?.key === 'sections'
    && operation.kind.action === 'insert' && operation.kind.elementId === original.kind.elementId);
  if (!priorInsert) throw documentError('The deleted block is no longer available for compensation.');
  const blockId = request.restoreBlockId || randomUUID();
  return { kind: { type: 'typed_field', key: 'sections', action: 'insert', elementId: blockId,
    afterId: priorInsert.kind.afterId || null, value: { ...priorInsert.kind.value, blockId, attribution: attribution(request) } } };
}

function validateSchemaVersion(snapshot, request) {
  if (request.schemaVersion !== undefined && request.schemaVersion !== snapshot.schema.schemaVersion) {
    throw documentError('Document edit uses a stale schema version.');
  }
}

async function readSnapshot(sessionId, options = {}, syncytium) {
  const snapshot = await syncytium.snapshot(sessionId, options || {});
  const fields = snapshot.shared.sharedFields;
  return { ...snapshot, shared: { ...snapshot.shared,
    sharedFields: { ...fields, sections: fields.sections || [], comments: fields.comments || [], document_undo: fields.document_undo || [] }
  } };
}

function validateSectionRole(role) {
  if (role !== undefined && !SECTION_ROLES.has(role)) throw documentError('Unsupported semantic section role.');
}

function validateMarks(marks, textLength) {
  if (!Array.isArray(marks) || marks.some((mark) => !validMark(mark, textLength))) throw documentError('Rich-text marks must use valid text offsets and types.');
}

function validMark(mark, textLength) {
  return mark && ['bold', 'italic', 'code', 'link', 'highlight'].includes(mark.type)
    && Number.isSafeInteger(mark.start) && Number.isSafeInteger(mark.end)
    && mark.start >= 0 && mark.end > mark.start && mark.end <= textLength;
}

function attribution(request) {
  return { actorId: request.actorId, nucleusId: request.nucleusId || null, displayName: request.displayName || null };
}

function validateIdentity(request) {
  if (!request.actorId) throw documentError('Document operations require actorId.');
}

function documentError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_DOCUMENT_OPERATION_INVALID' });
}

module.exports = { createDocumentVariantService };
