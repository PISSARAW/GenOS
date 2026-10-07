'use strict';

const paths = require('node:path').posix;
const { createHash } = require('node:crypto');
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
  const snapshot = await syncytium.snapshot(sessionId, options);
  const current = snapshot.shared.sharedFields.files || {};
  assertExpectedHash(change, current[filePath]);
  const file = inspector.inspect(filePath, change.content);
  assertFileUnlocked(current[filePath], change.actorId, { now: timeNow(change.now), lockToken: change.lockToken });
  file.expectedHash = change.expectedHash;
  return syncytium.applyTransaction(sessionId, { txId: change.txId || change.opId,
    operations: [{ opId: change.opId, actorId: change.actorId, role: change.role,
      intent: change.intent, evidence: change.evidence,
      kind: { type: 'typed_field', key: 'files', action: 'set', entryKey: filePath, value: file } }],
    preconditions: [{ op: 'equals', path: ['files', filePath, 'hash'], value: change.expectedHash }],
    commitPolicy: 'SERIALIZABLE' }, options);
}

async function recordTestResult(context) {
  const { sessionId, result, options, syncytium } = context;
  requireIdentity(result);
  if (typeof result.testId !== 'string' || !result.testId || !['passed', 'failed'].includes(result.status)) {
    throw codeError('SYNCYTIUM_CODE_TEST_INVALID', 'A test result requires testId and passed or failed status.');
  }
  const snapshot = await syncytium.snapshot(sessionId, options);
  const value = { ...result, sourceHash: workspaceHash(snapshot.shared.sharedFields.files || {}) };
  return applyTyped({ sessionId, value, key: 'tests', action: 'set', entryKey: result.testId, options, syncytium });
}

async function recordBuildState(context) {
  const { sessionId, build, options, syncytium } = context;
  requireIdentity(build);
  if (!['passed', 'failed', 'pending'].includes(build.status)) {
    throw codeError('SYNCYTIUM_CODE_BUILD_INVALID', 'A build state requires passed, failed or pending status.');
  }
  const snapshot = await syncytium.snapshot(sessionId, options);
  const value = { ...build, sourceHash: workspaceHash(snapshot.shared.sharedFields.files || {}) };
  return syncytium.applyOperation(sessionId, {
    opId: build.opId, actorId: build.actorId, kind: { type: 'typed_field', key: 'build', action: 'assign', value }
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
      build: fields.build || null,
      sourceHash: workspaceHash(files)
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
  if (!Object.hasOwn(change, 'expectedHash') || (change.expectedHash !== null
    && (typeof change.expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(change.expectedHash)))) {
    throw codeError('SYNCYTIUM_CODE_CHANGE_INVALID', 'Code changes require an expected SHA-256 hash or null for a new file.');
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
  const operations = closure.map((path) => {
    const value = { ...(files[path] || { filePath: path }), lockedBy: { actorId: request.actorId, lockToken: token, expiresAt } };
    return {
      opId: request.opId && path === filePath ? request.opId : randomUUID(), actorId: request.actorId,
      kind: { type: 'typed_field', key: 'files', action: 'set', entryKey: path, value }
    };
  });
  const result = await syncytium.applyTransaction(sessionId, { txId: request.txId || request.opId,
    operations, preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE' }, request.options || {});
  return { ...result, locked: closure, lockToken: token, expiresAt };
}

async function releaseLock(sessionId, request = {}, syncytium) {
  requireLockIdentity(request);
  const filePath = normalizePath(request.filePath);
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const files = snapshot.shared.sharedFields.files || {};
  const closure = lockClosure(files, filePath);
  const now = timeNow(request.now);
  const released = [];
  const operations = [];
  for (const path of closure) {
    if (clearLockEntry(files[path], request, now)) {
      const value = { ...files[path], lockedBy: null, lockReleasedAt: Date.now() };
      operations.push({ opId: released.length === 0 ? request.opId || randomUUID() : randomUUID(), actorId: request.actorId,
        kind: { type: 'typed_field', key: 'files', action: 'set', entryKey: path, value }
      });
      released.push(path);
    }
  }
  if (!released.length) throw codeError('SYNCYTIUM_CODE_LOCK_NOT_FOUND', 'Code file has no active lock.');
  const result = await releaseLockValues({ syncytium, sessionId, request, operations, snapshot });
  return { ...result, released };
}

async function verifyGate(sessionId, request = {}, syncytium) {
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const fields = snapshot.shared.sharedFields;
  const tests = fields.tests || {};
  const build = fields.build || null;
  const sourceHash = workspaceHash(fields.files || {});
  const entries = Object.values(tests).filter((item) => item.sourceHash === sourceHash);
  const passing = entries.filter((item) => item.status === 'passed').length;
  const reasons = gateReasons({ build, passing, sourceHash, total: entries.length });
  return { mergeable: reasons.length === 0, build: build?.status || null, passingTests: passing, totalTests: entries.length, reasons };
}

function gateReasons(context) {
  const reasons = [];
  if (context.build?.status !== 'passed') reasons.push('BUILD_NOT_PASSING');
  else if (context.build.sourceHash !== context.sourceHash) reasons.push('BUILD_STALE');
  if (context.passing === 0) reasons.push(context.total ? 'NO_CURRENT_PASSING_TESTS' : 'NO_PASSING_TESTS');
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
    const blocking = foreignLock(files[path], actorId, { now: now });
    if (blocking) throw codeError('SYNCYTIUM_CODE_LOCK_CONFLICT', `File '${path}' is locked by '${blocking.actorId}'.`);
  }
}

function assertFileUnlocked(file, actorId, { now, lockToken } = {}) {
  const blocking = foreignLock(file, actorId, { now: now, lockToken: lockToken });
  if (blocking) throw codeError('SYNCYTIUM_CODE_LOCK_CONFLICT', 'Code file is locked by another actor.');
}

function foreignLock(file, actorId, { now, lockToken } = {}) {
  const lock = file?.lockedBy;
  if (!lock || !(lock.expiresAt > now)) return null;
  if (lock.actorId === actorId && lock.lockToken === lockToken) return null;
  return lock;
}

function clearLockEntry(file, request, now) {
  const lock = file?.lockedBy;
  if (!lock) return false;
  const expired = !(lock.expiresAt > now);
  if (!expired && (lock.actorId !== request.actorId || !request.lockToken || lock.lockToken !== request.lockToken)) {
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

function workspaceHash(files) {
  const content = Object.entries(files).sort(([left], [right]) => left.localeCompare(right))
    .map(([filePath, file]) => `${filePath}\0${file.hash}`).join('\n');
  return createHash('sha256').update(content).digest('hex');
}

function codeError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { createCodeVariantService };

function releaseLockValues({ syncytium, sessionId, request, operations, snapshot }) {
  return syncytium.applyTransaction(sessionId, { txId: request.txId || request.opId || randomUUID(),
    operations, preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE' }, request.options || {});
}
