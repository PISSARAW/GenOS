/**
 * Idempotency Middleware
 * 
 * Ensures idempotent execution of external calls (LLM, tools, MCP) by using
 * idempotency keys. The key is derived from mission_id + step + attempt.
 * Deduplicates requests at the backend level to prevent double-billing and
 * side effects from retries.
 */

const crypto = require('crypto');
const database = require('../db');

const IDEMPOTENCY_HEADER = 'x-idempotency-key';
const IDEMPOTENCY_TTL_DAYS = 30;

function generateIdempotencyKey(missionId, step, attempt, toolName) {
  const payload = `${missionId}:${step}:${attempt}:${toolName || ''}`;
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 32);
}

async function checkIdempotency(key) {
  const row = database.prepare(
    'SELECT response_payload, created_at FROM idempotency_keys WHERE key = ?'
  ).get(key);
  return row;
}

async function storeIdempotency(key, responsePayload, statusCode) {
  database.prepare(
    `INSERT OR REPLACE INTO idempotency_keys (key, response_payload, status_code, created_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).run(key, JSON.stringify(responsePayload), statusCode);
}

function cleanupOldKeys() {
  database.prepare(
    `DELETE FROM idempotency_keys WHERE created_at < datetime('now', ?)`
  ).run(`-${IDEMPOTENCY_TTL_DAYS} days`);
}

function idempotencyMiddleware(options = {}) {
  const { 
    required = false,
    keyGenerator = generateIdempotencyKey,
    skipPaths = ['/healthz', '/readyz', '/livez', '/api/auth'] 
  } = options;

  return async (req, res, next) => {
    if (skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const providedKey = req.headers[IDEMPOTENCY_HEADER];
    const missionId = req.headers['x-mission-id'] || req.body?.mission_id;
    const step = req.headers['x-step'] || req.body?.step;
    const attempt = req.headers['x-attempt'] || req.body?.attempt || 1;
    const toolName = req.headers['x-tool-name'] || req.body?.tool_name;

    let idempotencyKey = providedKey;

    if (!idempotencyKey && missionId && step !== undefined) {
      idempotencyKey = keyGenerator(missionId, step, attempt, toolName);
      req.idempotencyKey = idempotencyKey;
      req.generatedIdempotencyKey = true;
    }

    if (!idempotencyKey) {
      if (required) {
        return res.status(400).json({
          error: 'Idempotency key required',
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          hint: `Provide '${IDEMPOTENCY_HEADER}' header or include mission_id, step, and attempt in request body`
        });
      }
      return next();
    }

    const existing = await checkIdempotency(idempotencyKey);
    if (existing) {
      res.setHeader('X-Idempotency-Replay', 'true');
      res.setHeader('X-Idempotency-Key', idempotencyKey);
      return res.status(existing.status_code).json(existing.response_payload);
    }

    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        storeIdempotency(idempotencyKey, payload, res.statusCode).catch(err => {
          console.error('Failed to store idempotency key:', err);
        });
      }
      return originalJson(payload);
    };

    res.setHeader('X-Idempotency-Key', idempotencyKey);
    next();
  };
}

function withIdempotency(missionId, step, attempt, toolName) {
  return generateIdempotencyKey(missionId, step, attempt, toolName);
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