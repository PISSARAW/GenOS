'use strict';

const paths = require('node:path').posix;
const inspector = require('./sourceInspector');
const schemaService = require('../../../syncytiumSchemaService');

function createCodeVariantService(syncytium) {
  return {
    createSession: (mission, options) => createCodeSession(mission, options, syncytium),
    applyChange: (sessionId, change, options = {}) => applyCodeChange({ sessionId, change, options, syncytium }),
    recordTestResult: (sessionId, result, options = {}) => recordTestResult({ sessionId, result, options, syncytium }),
    recordBuildState: (sessionId, build, options = {}) => recordBuildState({ sessionId, build, options, syncytium }),
    snapshot: (sessionId, options = {}) => getCodeSnapshot({ sessionId, options, syncytium })
  };
}

async function createCodeSession(mission, options, syncytium) {
  return syncytium.createSession(mission, { ...options, schema: compileCodeSchema() });
}

async function applyCodeChange(context) {
  const { sessionId, change, options, syncytium } = context;
  validateChange(change);
  const filePath = normalizePath(change.filePath);
  const current = (await syncytium.snapshot(sessionId, options)).shared.sharedFields.files || {};
  assertExpectedHash(change, current[filePath]);
  const file = inspector.inspect(filePath, change.content);
  file.hasExpectedHash = Object.hasOwn(change, 'expectedHash');
  file.expectedHash = change.expectedHash ?? null;
  return syncytium.applyOperation(sessionId, {
    opId: change.opId,
    actorId: change.actorId,
    role: change.role,
    intent: change.intent,
    evidence: change.evidence,
    kind: { type: 'typed_field', key: 'files', action: 'set', entryKey: filePath, value: file }
  }, options);
}

async function recordTestResult(context) {
  const { sessionId, result, options, syncytium } = context;
  requireIdentity(result);
  return applyTyped({ sessionId, value: result, key: 'tests', action: 'set', entryKey: result.testId, options, syncytium });
}

async function recordBuildState(context) {
  const { sessionId, build, options, syncytium } = context;
  requireIdentity(build);
  return syncytium.applyOperation(sessionId, {
    opId: build.opId, actorId: build.actorId, kind: { type: 'typed_field', key: 'build', action: 'assign', value: build }
  }, options);
}

async function applyTyped(context) {
  const { sessionId, value, key, action, entryKey, options, syncytium } = context;
  return syncytium.applyOperation(sessionId, {
    opId: value.opId, actorId: value.actorId,
    kind: { type: 'typed_field', key, action, entryKey, value }
  }, options);
}

async function getCodeSnapshot(context) {
  const { sessionId, options, syncytium } = context;
  const snapshot = await syncytium.snapshot(sessionId, options);
  const fields = snapshot.shared.sharedFields;
  const files = fields.files || {};
  return {
    ...snapshot,
    code: {
      files,
      symbols: Object.fromEntries(Object.entries(files).map(([path, file]) => [path, file.symbols || {}])),
      dependencies: Object.fromEntries(Object.entries(files).map(([path, file]) => [path, file.dependencies || []])),
      tests: fields.tests || {},
      build: fields.build || null
    }
  };
}

function compileCodeSchema() {
  return schemaService.compile({ schemaId: 'syncytium-code-v1', fields: {
    files: { dataType: 'MAP', consistencyZone: 'INVARIANT_PRESERVING' },
    tests: { dataType: 'MAP', consistencyZone: 'EVENTUAL' },
    build: { dataType: 'LWW_REGISTER', consistencyZone: 'CAUSAL' }
  } });
}

function validateChange(change) {
  requireIdentity(change);
  if (typeof change.filePath !== 'string' || typeof change.content !== 'string') {
    throw codeError('SYNCYTIUM_CODE_CHANGE_INVALID', 'Code changes require filePath and string content.');
  }
}

function requireIdentity(input) {
  if (!input?.opId || !input?.actorId) throw codeError('SYNCYTIUM_CODE_CHANGE_INVALID', 'Code operations require opId and actorId.');
}

function normalizePath(filePath) {
  const normalized = paths.normalize(filePath.replace(/\\/g, '/'));
  if (!normalized || normalized === '.' || normalized.startsWith('../') || paths.isAbsolute(normalized)
    || /^[A-Za-z]:/.test(normalized) || normalized.includes('\0')) {
    throw codeError('SYNCYTIUM_CODE_PATH_INVALID', 'Code file path must stay inside the shared workspace.');
  }
  return normalized.replace(/^\.\//, '');
}

function assertExpectedHash(change, currentFile) {
  if (change.expectedHash !== undefined && change.expectedHash !== (currentFile?.hash || null)) {
    throw codeError('SYNCYTIUM_CODE_STALE_WRITE', 'Code file changed since the supplied base hash.');
  }
}

function codeError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { createCodeVariantService };
