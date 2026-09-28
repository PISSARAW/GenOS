/**
 * Idempotency Middleware
 *
 * Ensures idempotent execution of external calls (LLM, tools, MCP) by using
 * idempotency keys. The key is derived from mission_id + step + attempt.
 * Deduplicates requests at the backend level to prevent double-billing and
 * side effects from retries.
 */

const crypto = require('crypto');
const { getDatabase } = require('../db');

const IDEMPOTENCY_HEADER = 'x-idempotency-key';
const IDEMPOTENCY_TTL_DAYS = 30;
const IN_FLIGHT_MARKER = '__IN_FLIGHT__';
const IN_FLIGHT_TTL_MS = 5 * 60 * 1000;

function generateIdempotencyKey({ missionId, step, attempt, toolName } = {}) {
  const payload = `${missionId}:${step}:${attempt}:${toolName || ''}`;
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 32);
}

async function checkIdempotency(key) {
  const db = await getDatabase();
  const row = await db.get(
    'SELECT key, response_payload, status_code, created_at FROM idempotency_keys WHERE key = ?',
    key
  );
  return row || null;
}

async function storeIdempotency(key, responsePayload, statusCode) {
  const db = await getDatabase();
  await db.run(
    `INSERT OR REPLACE INTO idempotency_keys (key, response_payload, status_code, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    key, JSON.stringify(responsePayload), statusCode
  );
}

async function cleanupOldKeys() {
  const db = await getDatabase();
  await db.run(
    `DELETE FROM idempotency_keys WHERE created_at < datetime('now', ?)`,
    `-${IDEMPOTENCY_TTL_DAYS} days`
  );
  await db.run(
    `DELETE FROM idempotency_keys WHERE response_payload = ? AND created_at < datetime('now', '-1 hour')`,
    IN_FLIGHT_MARKER
  );
}

async function removeIdempotencyKey(key) {
  const db = await getDatabase();
  await db.run('DELETE FROM idempotency_keys WHERE key = ? AND response_payload = ?', key, IN_FLIGHT_MARKER);
}

function isInFlight(row) {
  return !!row && row.response_payload === IN_FLIGHT_MARKER;
}

function isStaleInFlight(row) {
  if (!isInFlight(row)) return false;
  const created = new Date(row.created_at).getTime();
  if (!Number.isFinite(created)) return false;
  return Date.now() - created > IN_FLIGHT_TTL_MS;
}

async function claimIdempotencyKey(key) {
  const db = await getDatabase();
  const result = await db.run(
    `INSERT OR IGNORE INTO idempotency_keys (key, response_payload, status_code, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    key, IN_FLIGHT_MARKER, 202
  );
  return result && typeof result.changes === 'number' ? result.changes > 0 : true;
}

function handleConflict(res, clientKey) {
  res.setHeader('X-Idempotency-Key', clientKey);
  return res.status(409).json({
    error: 'Idempotent request already in progress',
    code: 'IDEMPOTENCY_IN_PROGRESS',
    hint: 'Retry with the same key after the in-flight request completes',
  });
}

async function replayOrConflict(res, key, clientKey) {
  const existing = await checkIdempotency(key);
  if (!existing) return null;
  if (!isInFlight(existing)) return handleReplay(res, { ...existing, key: clientKey });
  if (!isStaleInFlight(existing)) return handleConflict(res, clientKey);
  await removeIdempotencyKey(key);
  return null;
}

async function claimOrConflict(res, key, clientKey) {
  if (await claimIdempotencyKey(key)) return null;
  const raced = await checkIdempotency(key);
  if (raced && !isInFlight(raced)) return handleReplay(res, { ...raced, key: clientKey });
  return handleConflict(res, clientKey);
}

function shouldSkip(path, skipPaths) {
  return skipPaths.some(skipPath => path.startsWith(skipPath));
}

function buildRequestContext(req) {
  return {
    providedKey: req.headers[IDEMPOTENCY_HEADER],
    missionId: req.headers['x-mission-id'] || req.body?.mission_id,
    step: req.headers['x-step'] || req.body?.step,
    attempt: req.headers['x-attempt'] || req.body?.attempt || 1,
    toolName: req.headers['x-tool-name'] || req.body?.tool_name,
  };
}

function resolveClientKey(req, ctx, keyGenerator) {
  if (ctx.providedKey) return ctx.providedKey;
  if (!ctx.missionId || ctx.step === undefined) return null;
  req.generatedIdempotencyKey = true;
  return keyGenerator({ missionId: ctx.missionId, step: ctx.step, attempt: ctx.attempt, toolName: ctx.toolName });
}

function hashRequestScope(req, clientKey) {
  const requestScope = {
    principal: req.user?.keyId || req.user?.username || req.user?.id || 'authenticated',
    method: req.method,
    url: req.originalUrl || req.url || req.path,
    organizationId: req.headers['x-organization-id'] || '',
    projectId: req.headers['x-project-id'] || '',
    clientKey,
  };
  return crypto.createHash('sha256').update(JSON.stringify(requestScope)).digest('hex');
}

async function resolveIdempotencyKey(req, ctx, keyGenerator) {
  const clientKey = resolveClientKey(req, ctx, keyGenerator);
  if (!clientKey) return null;
  req.idempotencyKey = clientKey;
  req.idempotencyClientKey = clientKey;
  return hashRequestScope(req, clientKey);
}

function handleMissingKey(res, required) {
  if (!required) return null;
  return res.status(400).json({
    error: 'Idempotency key required',
    code: 'IDEMPOTENCY_KEY_REQUIRED',
    hint: `Provide '${IDEMPOTENCY_HEADER}' header or include mission_id, step, and attempt in request body`,
  });
}

function parseStoredPayload(existing) {
  try {
    return JSON.parse(existing.response_payload);
  } catch (_) {
    return existing.response_payload;
  }
}

function handleReplay(res, existing) {
  res.setHeader('X-Idempotency-Replay', 'true');
  res.setHeader('X-Idempotency-Key', existing.key);
  return res.status(existing.status_code).json(parseStoredPayload(existing));
}

function patchResponse(res, idempotencyKey) {
  const originalJson = res.json.bind(res);
  let jsonResponse = false;
  res.once('finish', () => {
    // Streaming, redirect, and plain-text responses do not have a replayable
    // JSON body. Release their reservation so they do not block retries.
    if (!jsonResponse || res.statusCode < 200 || res.statusCode >= 300) {
      removeIdempotencyKey(idempotencyKey).catch(err => {
        console.error('Failed to release idempotency key:', err);
      });
    }
  });
  res.json = (payload) => {
    jsonResponse = true;
    const statusCode = res.statusCode;
    if (statusCode >= 200 && statusCode < 300) {
      storeIdempotency(idempotencyKey, payload, statusCode).catch(err => {
        console.error('Failed to store idempotency key:', err);
      });
    } else {
      removeIdempotencyKey(idempotencyKey).catch(err => {
        console.error('Failed to release idempotency key:', err);
      });
    }
    return originalJson(payload);
  };
}

function idempotencyMiddleware(options = {}) {
  const { required = false, keyGenerator = generateIdempotencyKey, skipPaths = ['/healthz', '/readyz', '/livez', '/api/auth'] } = options;

  return async (req, res, next) => {
    if (shouldSkip(req.path, skipPaths)) return next();

    const ctx = buildRequestContext(req);
    const idempotencyKey = await resolveIdempotencyKey(req, ctx, keyGenerator);

    if (!idempotencyKey) return handleMissingKey(res, required) || next();
    const clientKey = req.idempotencyClientKey;
    if (await replayOrConflict(res, idempotencyKey, clientKey)) return;
    if (await claimOrConflict(res, idempotencyKey, clientKey)) return;

    patchResponse(res, idempotencyKey);
    res.setHeader('X-Idempotency-Key', clientKey);
    next();
  };
}

function withIdempotency({ missionId, step, attempt, toolName } = {}) {
  return generateIdempotencyKey({ missionId, step, attempt, toolName });
}

module.exports = {
  idempotencyMiddleware,
  generateIdempotencyKey,
  checkIdempotency,
  storeIdempotency,
  cleanupOldKeys,
  withIdempotency,
  removeIdempotencyKey,
  IDEMPOTENCY_HEADER,
};
