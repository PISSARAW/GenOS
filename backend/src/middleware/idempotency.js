/**
 * Idempotency Middleware
 *
 * Replays successful keyed HTTP responses after a durable SQLite receipt.
 * This middleware does not make downstream LLM/tool/MCP effects exactly-once.
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
    'SELECT key, request_hash, response_payload, status_code, created_at FROM idempotency_keys WHERE key = ?',
    key
  );
  return row || null;
}

async function storeIdempotency(input) {
  const db = await getDatabase();
  const result = await db.run(`UPDATE idempotency_keys SET response_payload = ?, status_code = ?,
    created_at = datetime('now') WHERE key = ? AND request_hash = ? AND response_payload = ?`,
  JSON.stringify(input.responsePayload), input.statusCode, input.key, input.requestHash, IN_FLIGHT_MARKER);
  if (result?.changes !== 1) throw new Error('Idempotency receipt reservation was lost before commit.');
}

async function cleanupOldKeys() {
  const db = await getDatabase();
  await db.run(
    `DELETE FROM idempotency_keys WHERE response_payload != ? AND created_at < datetime('now', ?)`,
    IN_FLIGHT_MARKER, `-${IDEMPOTENCY_TTL_DAYS} days`
  );
}

async function removeIdempotencyKey(key) {
  const db = await getDatabase();
  await db.run('DELETE FROM idempotency_keys WHERE key = ? AND response_payload = ?', key, IN_FLIGHT_MARKER);
}

function isInFlight(row) {
  return !!row && row.response_payload === IN_FLIGHT_MARKER;
}

function isUncertainInFlight(row) {
  if (!isInFlight(row)) return false;
  const created = new Date(row.created_at).getTime();
  if (!Number.isFinite(created)) return true;
  return Date.now() - created > IN_FLIGHT_TTL_MS;
}

async function claimIdempotencyKey(key, requestHash) {
  const db = await getDatabase();
  const result = await db.run(
    `INSERT OR IGNORE INTO idempotency_keys (key, request_hash, response_payload, status_code, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    key, requestHash, IN_FLIGHT_MARKER, 202
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

function handleUncertain(res, clientKey) {
  res.setHeader('X-Idempotency-Key', clientKey);
  return res.status(409).json({
    error: 'The previous request outcome is uncertain; reconcile it before retrying',
    code: 'IDEMPOTENCY_OUTCOME_UNCERTAIN'
  });
}

function requestHash(req) {
  const headers = ['if-match', 'if-none-match', 'x-mission-id', 'x-step', 'x-attempt', 'x-tool-name']
    .reduce((selected, name) => ({ ...selected, [name]: req.headers[name] || '' }), {});
  return crypto.createHash('sha256').update(JSON.stringify(canonical({ body: req.body ?? null, headers }))).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function replayOrReject(input) {
  const { res, existing, clientKey, bodyHash } = input;
  if (!existing) return null;
  if (!existing.request_hash) {
    res.setHeader('X-Idempotency-Key', clientKey);
    return res.status(409).json({ error: 'Stored idempotency response is not bound to a request body',
      code: 'IDEMPOTENCY_REQUEST_UNBOUND' });
  }
  if (existing.request_hash !== bodyHash) {
    res.setHeader('X-Idempotency-Key', clientKey);
    return res.status(409).json({ error: 'Idempotency key is bound to a different request body',
      code: 'IDEMPOTENCY_KEY_CONFLICT' });
  }
  if (!isInFlight(existing)) return handleReplay(res, { ...existing, key: clientKey });
  return isUncertainInFlight(existing) ? handleUncertain(res, clientKey) : handleConflict(res, clientKey);
}

async function replayOrConflict(input) {
  const existing = await checkIdempotency(input.key);
  return replayOrReject({ ...input, existing });
}

async function claimOrConflict(input) {
  if (await claimIdempotencyKey(input.key, input.bodyHash)) return null;
  const raced = await checkIdempotency(input.key);
  const response = replayOrReject({ ...input, existing: raced });
  if (response) return response;
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

function isSuccess(statusCode) { return statusCode >= 200 && statusCode < 300; }

function rejectUnreplayable(ctx) {
  if (ctx.state.blockedOutput) return;
  ctx.state.blockedOutput = true;
  ctx.res.status(503);
  ctx.res.removeHeader?.('Content-Length');
  ctx.res.setHeader('Content-Type', 'application/json; charset=utf-8');
  ctx.originalEnd(JSON.stringify({ error: 'Keyed requests require a replayable JSON response',
    code: 'IDEMPOTENCY_RESPONSE_UNSUPPORTED' }));
}

function guardEnd(ctx) {
  ctx.res.end = (...args) => {
    if (ctx.state.blockedOutput) return ctx.res;
    if (ctx.state.receiptCommitted || !isSuccess(ctx.res.statusCode)) return ctx.originalEnd(...args);
    rejectUnreplayable(ctx);
    return ctx.res;
  };
}

function guardWrite(ctx) {
  ctx.res.write = (...args) => {
    if (ctx.state.blockedOutput) return false;
    if (!ctx.state.receiptCommitted && isSuccess(ctx.res.statusCode)) {
      rejectUnreplayable(ctx);
      return false;
    }
    return ctx.originalWrite(...args);
  };
}

function guardHeaders(ctx) {
  ctx.res.writeHead = (statusCode, ...args) => {
    if (!ctx.state.receiptCommitted && isSuccess(statusCode)) {
      rejectUnreplayable(ctx);
      return ctx.res;
    }
    return ctx.originalWriteHead(statusCode, ...args);
  };
  if (!ctx.originalFlushHeaders) return;
  ctx.res.flushHeaders = () => {
    if (!ctx.state.receiptCommitted && isSuccess(ctx.res.statusCode)) rejectUnreplayable(ctx);
    else ctx.originalFlushHeaders();
    return ctx.res;
  };
}

function sendUncertain(ctx, error) {
  console.error('Failed to commit idempotency receipt; request outcome is uncertain:', error);
  ctx.res.status(503);
  ctx.originalJson({ error: 'Request completed but its replay receipt could not be committed',
    code: 'IDEMPOTENCY_OUTCOME_UNCERTAIN' });
}

function sendJson(ctx, payload) {
  const statusCode = ctx.res.statusCode;
  if ([204, 205].includes(statusCode)) {
    ctx.res.status(503);
    return ctx.originalJson({ error: 'Keyed requests require a replayable JSON response',
      code: 'IDEMPOTENCY_RESPONSE_UNSUPPORTED' });
  }
  if (!isSuccess(statusCode)) return ctx.originalJson(payload);
  const receipt = { key: ctx.key, requestHash: ctx.bodyHash, responsePayload: payload, statusCode };
  storeIdempotency(receipt).then(() => {
    ctx.state.receiptCommitted = true;
    ctx.originalJson(payload);
  }).catch((error) => sendUncertain(ctx, error));
  return ctx.res;
}

function patchResponse(res, idempotencyKey, bodyHash) {
  const ctx = { res, key: idempotencyKey, bodyHash,
    originalJson: res.json.bind(res), originalEnd: res.end.bind(res),
    originalWrite: res.write.bind(res), originalWriteHead: res.writeHead.bind(res),
    originalFlushHeaders: res.flushHeaders?.bind(res), state: { receiptCommitted: false, blockedOutput: false } };
  guardEnd(ctx);
  guardWrite(ctx);
  guardHeaders(ctx);
  res.json = (payload) => sendJson(ctx, payload);
}

function idempotencyMiddleware(options = {}) {
  const { required = false, keyGenerator = generateIdempotencyKey, skipPaths = ['/healthz', '/readyz', '/livez', '/api/auth'] } = options;

  return async (req, res, next) => {
    if (shouldSkip(req.path, skipPaths)) return next();

    const ctx = buildRequestContext(req);
    const idempotencyKey = await resolveIdempotencyKey(req, ctx, keyGenerator);

    if (!idempotencyKey) return handleMissingKey(res, required) || next();
    const clientKey = req.idempotencyClientKey;
    const bodyHash = requestHash(req);
    const context = { res, key: idempotencyKey, clientKey, bodyHash };
    if (await replayOrConflict(context)) return;
    if (await claimOrConflict(context)) return;

    patchResponse(res, idempotencyKey, bodyHash);
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
