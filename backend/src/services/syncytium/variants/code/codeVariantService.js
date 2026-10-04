'use strict';

const paths = require('node:path').posix;
const inspector = require('./sourceInspector');
const schemaService = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');

function createCodeVariantService(syncytium) {
  return {
    createSession: (mission, options) => createCodeSession(mission, options, syncytium),
    applyChange: (sessionId, change, options) => applyCodeChange({ sessionId, change, options, syncytium }),
    recordTestResult: (sessionId, result, options) => recordTestResult({ sessionId, result, options, syncytium }),
    recordBuildState: (sessionId, build, options) => recordBuildState({ sessionId, build, options, syncytium }),
    acquireFileLock: (sessionId, request) => acquireLockAtomic(sessionId, request, syncytium),
    releaseFileLock: (sessionId, request) => releaseLockAtomic(sessionId, request, syncytium),
    verifyMergeGate: (sessionId, request) => verifyGate(sessionId, request, syncytium),
    snapshot: (sessionId, options) => getCodeSnapshot({ sessionId, options, syncytium })
  };
}

async function createCodeSession(mission, options, syncytium) { return syncytium.createSession(mission, { ...options, schema: compileCodeSchema() }); }

async function applyCodeChange(ctx) { const { sessionId, change, options, syncytium } = ctx; validateChange(change); const filePath = normalizePath(change.filePath); const snapshot = await syncytium.snapshot(sessionId, options); const current = snapshot.shared.sharedFields.files || {}; assertExpectedHash(change, current[filePath]); const file = inspector.inspect(filePath, change.content); assertFileUnlocked(current[filePath], change.actorId, timeNow(change.now)); file.hasExpectedHash = Object.hasOwn(change, 'expectedHash'); file.expectedHash = change.expectedHash ?? null; return syncytium.applyOperation(sessionId, { opId: change.opId, actorId: change.actorId, role: change.role, intent: change.intent, evidence: change.evidence, kind: { type: 'typed_field', key: 'files', action: 'set', entryKey: filePath, value: file } }, options); }

async function recordTestResult(ctx) { const { sessionId, result, options, syncytium } = ctx; requireIdentity(result); return applyTyped({ sessionId, value: result, key: 'tests', action: 'set', entryKey: result.testId, options, syncytium }); }
async function recordBuildState(ctx) { const { sessionId, build, options, syncytium } = ctx; requireIdentity(build); return syncytium.applyOperation(sessionId, { opId: build.opId, actorId: build.actorId, kind: { type: 'typed_field', key: 'build', action: 'assign', value: build } }, options); }
async function applyTyped(ctx) { const { sessionId, value, key, action, entryKey, options, syncytium } = ctx; return syncytium.applyOperation(sessionId, { opId: value.opId, actorId: value.actorId, kind: { type: 'typed_field', key, action, entryKey, value } }, options); }

async function getCodeSnapshot(ctx) { const { sessionId, options, syncytium } = ctx; const snapshot = await syncytium.snapshot(sessionId, options); const fields = snapshot.shared.sharedFields; const files = fields.files || {}; return { ...snapshot, code: { files, symbols: Object.fromEntries(Object.entries(files).map(([p, f]) => [p, f.symbols || {}])), dependencies: Object.fromEntries(Object.entries(files).map(([p, f]) => [p, f.dependencies || []])), tests: fields.tests || {}, build: fields.build || null } }; }

function compileCodeSchema() { return schemaService.compile({ schemaId: 'syncytium-code-v1', fields: { files: { dataType: 'MAP', consistencyZone: 'INVARIANT_PRESERVING' }, tests: { dataType: 'MAP', consistencyZone: 'EVENTUAL' }, build: { dataType: 'LWW_REGISTER', consistencyZone: 'CAUSAL' } } }); }

function validateChange(change) { requireIdentity(change); if (typeof change.filePath !== 'string' || typeof change.content !== 'string') throw codeError('SYNCYTIUM_CODE_CHANGE_INVALID', 'Code changes require filePath and string content.'); }
function requireIdentity(input) { if (!input?.opId || !input?.actorId) throw codeError('SYNCYTIUM_CODE_CHANGE_INVALID', 'Code operations require opId and actorId.'); }
function normalizePath(filePath) { const normalized = paths.normalize(filePath.replace(/\\/g, '/')); if (!normalized || normalized === '.' || normalized.startsWith('../') || paths.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized) || normalized.includes('\0')) throw codeError('SYNCYTIUM_CODE_PATH_INVALID', 'Code file path must stay inside the shared workspace.'); return normalized.replace(/^\.\//, ''); }
function assertExpectedHash(change, currentFile) { if (change.expectedHash !== undefined && change.expectedHash !== (currentFile?.hash || null)) throw codeError('SYNCYTIUM_CODE_STALE_WRITE', 'Code file changed since the supplied base hash.'); }

async function acquireLockAtomic(sessionId, request = {}, syncytium) {
  requireLockIdentity(request);
  const filePath = normalizePath(request.filePath);
  const maxRetries = request.maxRetries ?? 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const snapshot = await syncytium.snapshot(sessionId, request.options || {});
    const files = snapshot.shared.sharedFields.files || {};
    const closure = lockClosure(files, filePath);
    const now = timeNow(request.now);
    try {
      assertClosureUnlocked({ files, closure, actorId: request.actorId, now });
      const lock = { actorId: request.actorId, lockToken: request.lockToken || randomUUID(), expiresAt: now + lockDuration(request.ttlMs) };
      const operations = closure.map((path) => buildLockOperation({ path, file: files[path], lock }));
      await applyLockTransaction({ sessionId, request, snapshot, operations, syncytium });
      return { locked: closure, ...lock, retries: attempt - 1 };
    } catch (error) {
      if (!isRetryable(error) || attempt === maxRetries) throw error;
      await sleep(50 * attempt);
    }
  }
  throw codeError('SYNCYTIUM_CODE_LOCK_CONFLICT', 'Failed to acquire lock after retries');
}

async function releaseLockAtomic(sessionId, request = {}, syncytium) {
  requireLockIdentity(request);
  const filePath = normalizePath(request.filePath);
  const maxRetries = request.maxRetries ?? 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const snapshot = await syncytium.snapshot(sessionId, request.options || {});
    const files = snapshot.shared.sharedFields.files || {};
    const closure = lockClosure(files, filePath);
    const now = timeNow(request.now);
    const operations = closure.filter((path) => clearLockEntry(files[path], request, now))
      .map((path) => buildUnlockOperation({ path, file: files[path], actorId: request.actorId }));
    if (!operations.length) throw codeError('SYNCYTIUM_CODE_LOCK_NOT_FOUND', 'Code file has no active lock.');
    try {
      await applyLockTransaction({ sessionId, request, snapshot, operations, syncytium });
      return { released: closure, retries: attempt - 1 };
    } catch (error) {
      if (!isRetryable(error) || attempt === maxRetries) throw error;
      await sleep(50 * attempt);
    }
  }
  throw codeError('SYNCYTIUM_CODE_LOCK_CONFLICT', 'Failed to release lock after retries');
}

function buildLockOperation({ path, file, lock }) {
  const value = { ...(file || { filePath: path }), lockedBy: lock };
  return { opId: randomUUID(), actorId: lock.actorId, kind: { type: 'typed_field', key: 'files', action: 'set', entryKey: path, value } };
}

function buildUnlockOperation({ path, file, actorId }) {
  const value = { ...file, lockedBy: null, lockReleasedAt: Date.now() };
  return { opId: randomUUID(), actorId, kind: { type: 'typed_field', key: 'files', action: 'set', entryKey: path, value } };
}

async function applyLockTransaction({ sessionId, request, snapshot, operations, syncytium }) {
  const transaction = { txId: request.txId || randomUUID(), operations, preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE' };
  return syncytium.applyTransaction(sessionId, transaction, request.options || {});
}

function isRetryable(error) {
  return ['SYNCYTIUM_TRANSACTION_CONFLICT', 'SYNCYTIUM_PRECONDITION_FAILED'].includes(error.code);
}
async function verifyGate(sessionId, request, syncytium) { const snapshot = await syncytium.snapshot(sessionId, request.options || {}); const fields = snapshot.shared.sharedFields; const tests = fields.tests || {}; const build = fields.build || null; const entries = Object.values(tests); const passing = entries.filter(item => item.status === 'passed').length; const reasons = gateReasons({ build, passing, total: entries.length }); return { mergeable: reasons.length === 0, build: build?.status || null, passingTests: passing, totalTests: entries.length, reasons }; }

function gateReasons({ build, passing }) { const reasons = []; if (build?.status !== 'passed') reasons.push('BUILD_NOT_PASSING'); if (passing === 0) reasons.push('NO_PASSING_TESTS'); return reasons; }

function lockClosure(files, filePath) { const closure = [filePath]; const queue = [...(files[filePath]?.dependencies || [])].map(d => d.target).filter(Boolean); while (queue.length) { const next = queue.shift(); if (!next || closure.includes(next)) continue; closure.push(next); for (const dep of files[next]?.dependencies || []) if (dep.target) queue.push(dep.target); } return closure; }

function assertClosureUnlocked(ctx) { const { files, closure, actorId, now } = ctx; for (const path of closure) { const blocking = foreignLock(files[path], actorId, now); if (blocking) throw codeError('SYNCYTIUM_CODE_LOCK_CONFLICT', `File '${path}' is locked by '${blocking.actorId}'.`); } }
function assertFileUnlocked(file, actorId, now) { const blocking = foreignLock(file, actorId, now); if (blocking) throw codeError('SYNCYTIUM_CODE_LOCK_CONFLICT', 'Code file is locked by another actor.'); }
function foreignLock(file, actorId, now) { const lock = file?.lockedBy; if (!lock || lock.actorId === actorId || !(lock.expiresAt > now)) return null; return lock; }
function clearLockEntry(file, request, now) { const lock = file?.lockedBy; if (!lock) return false; const expired = !(lock.expiresAt > now); if (!expired && (lock.actorId !== request.actorId || (request.lockToken && lock.lockToken !== request.lockToken))) throw codeError('SYNCYTIUM_CODE_LOCK_NOT_OWNED', 'Code lock owner or token does not match.'); return true; }
function requireLockIdentity(request) { requireIdentity(request); if (typeof request.filePath !== 'string') throw codeError('SYNCYTIUM_CODE_LOCK_INVALID', 'File lock requires filePath.'); }
function lockDuration(value) { const ttlMs = value === undefined ? 60000 : value; if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 3600000) throw codeError('SYNCYTIUM_CODE_LOCK_INVALID', 'Lock ttlMs must be between 1 ms and one hour.'); return ttlMs; }
function timeNow(value) { return Number.isSafeInteger(value) ? value : Date.now(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function codeError(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { createCodeVariantService };