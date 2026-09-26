'use strict';

const paths = require('node:path').posix;
const inspector = require('./sourceInspector');
const schemaService = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');

function createCodeVariantService(syncytium) {
  return {
    createSession: (mission, options) => createCodeSession(mission, options, syncytium),
    applyChange: (sessionId, change, options = {}) => applyCodeChange({ sessionId, change, options, syncytium }),
    recordTestResult: (sessionId, result, options = {}) => recordTestResult({ sessionId, result, options, syncytium }),
    recordBuildState: (sessionId, build, options = {}) => recordBuildState({ sessionId, build, options, syncytium }),
    acquireFileLock: (sessionId, request) => acquireLock(sessionId, request, syncytium),
    releaseFileLock: (sessionId, request) => releaseLock(sessionId, request, syncytium),
    verifyMergeGate: (sessionId, request) => verifyGate(sessionId, request, syncytium),
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
  assertFileUnlocked(current[filePath], change.actorId, timeNow(change.now));
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

async function acquireLock(sessionId, request = {}, syncytium) {
  requireLockIdentity(request);
  const filePath = normalizePath(request.filePath);
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const files = snapshot.shared.sharedFields.files || {};
  const closure = lockClosure(files, filePath);
  const now = timeNow(request.now);
  assertClosureUnlocked({ files, closure, actorId: request.actorId, now });
  const token = request.lockToken || randomUUID();
  const expiresAt = now + lockDuration(request.ttlMs);
  const locked = [];
  for (const path of closure) {
    const value = { ...(files[path] || { filePath: path }), lockedBy: { actorId: request.actorId, lockToken: token, expiresAt } };
    await syncytium.applyOperation(sessionId, {
      opId: request.opId && path === filePath ? request.opId : randomUUID(), actorId: request.actorId,
      kind: { type: 'typed_field', key: 'files', action: 'set', entryKey: path, value }
    }, request.options || {});
    locked.push(path);
  }
  return { locked, lockToken: token, expiresAt };
}

async function releaseLock(sessionId, request = {}, syncytium) {
  requireLockIdentity(request);
  const filePath = normalizePath(request.filePath);
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const files = snapshot.shared.sharedFields.files || {};
  const closure = lockClosure(files, filePath);
  const now = timeNow(request.now);
  const released = [];
  for (const path of closure) {
    if (clearLockEntry(files[path], request, now)) {
      const value = { ...files[path], lockedBy: null, lockReleasedAt: Date.now() };
      await syncytium.applyOperation(sessionId, {
        opId: released.length === 0 ? request.opId || randomUUID() : randomUUID(), actorId: request.actorId,
        kind: { type: 'typed_field', key: 'files', action: 'set', entryKey: path, value }
      }, request.options || {});
      released.push(path);
    }
  }
  if (!released.length) throw codeError('SYNCYTIUM_CODE_LOCK_NOT_FOUND', 'Code file has no active lock.');
  return { released };
}

async function verifyGate(sessionId, request = {}, syncytium) {
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const fields = snapshot.shared.sharedFields;
  const tests = fields.tests || {};
  const build = fields.build || null;
  const entries = Object.values(tests);
  const passing = entries.filter((item) => item.status === 'passed').length;
  const reasons = gateReasons({ build, passing, total: entries.length });
  return { mergeable: reasons.length === 0, build: build?.status || null, passingTests: passing, totalTests: entries.length, reasons };
}

function gateReasons(context) {
  const reasons = [];
  if (context.build?.status !== 'passed') reasons.push('BUILD_NOT_PASSING');
  if (context.passing === 0) reasons.push('NO_PASSING_TESTS');
  return reasons;
}

function lockClosure(files, filePath) {
  const closure = [filePath];
  const queue = [...(files[filePath]?.dependencies || [])].map((dep) => dep.target).filter(Boolean);
  while (queue.length) {
    const next = queue.shift();
    if (!next || closure.includes(next)) continue;
    closure.push(next);
    for (const dep of files[next]?.dependencies || []) {
      if (dep.target) queue.push(dep.target);
    }
  }
  return closure;
}

function assertClosureUnlocked(context) {
  const { files, closure, actorId, now } = context;
  for (const path of closure) {
    const blocking = foreignLock(files[path], actorId, now);
    if (blocking) throw codeError('SYNCYTIUM_CODE_LOCK_CONFLICT', `File '${path}' is locked by '${blocking.actorId}'.`);
  }
}

function assertFileUnlocked(file, actorId, now) {
  const blocking = foreignLock(file, actorId, now);
  if (blocking) throw codeError('SYNCYTIUM_CODE_LOCK_CONFLICT', 'Code file is locked by another actor.');
}

function foreignLock(file, actorId, now) {
  const lock = file?.lockedBy;
  if (!lock || lock.actorId === actorId || !(lock.expiresAt > now)) return null;
  return lock;
}

function clearLockEntry(file, request, now) {
  const lock = file?.lockedBy;
  if (!lock) return false;
  const expired = !(lock.expiresAt > now);
  if (!expired && (lock.actorId !== request.actorId || (request.lockToken && lock.lockToken !== request.lockToken))) {
    throw codeError('SYNCYTIUM_CODE_LOCK_NOT_OWNED', 'Code lock owner or token does not match.');
  }
  return true;
}

function requireLockIdentity(request) {
  requireIdentity(request);
  if (typeof request.filePath !== 'string') throw codeError('SYNCYTIUM_CODE_LOCK_INVALID', 'File lock requires filePath.');
}

function lockDuration(value) {
  const ttlMs = value === undefined ? 60000 : value;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 3600000) throw codeError('SYNCYTIUM_CODE_LOCK_INVALID', 'Lock ttlMs must be between 1 ms and one hour.');
  return ttlMs;
}

function timeNow(value) {
  return Number.isSafeInteger(value) ? value : Date.now();
}

function codeError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { createCodeVariantService };
