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

async function resolveIdempotencyKey(req, ctx, keyGenerator) {
  if (ctx.providedKey) return ctx.providedKey;
  if (!ctx.missionId || ctx.step === undefined) return null;
  const key = keyGenerator({ missionId: ctx.missionId, step: ctx.step, attempt: ctx.attempt, toolName: ctx.toolName });
  req.idempotencyKey = key;
  req.generatedIdempotencyKey = true;
  return key;
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
  res.json = (payload) => {
    const statusCode = res.statusCode;
    if (statusCode >= 200 && statusCode < 300) {
      storeIdempotency(idempotencyKey, payload, statusCode).catch(err => {
        console.error('Failed to store idempotency key:', err);
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

    const existing = await checkIdempotency(idempotencyKey);
    if (existing) return handleReplay(res, existing);

    patchResponse(res, idempotencyKey);
    res.setHeader('X-Idempotency-Key', idempotencyKey);
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
  IDEMPOTENCY_HEADER,
};
