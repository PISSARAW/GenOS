const crypto = require('crypto');

const MAX_TURN_BYTES = 1024 * 1024;

function encoded(value) {
  const json = JSON.stringify(value);
  if (!json || Buffer.byteLength(json) > MAX_TURN_BYTES) {
    throw Object.assign(new Error('Model context turn exceeds the durable snapshot limit.'), { code: 'MODEL_CONTEXT_TOO_LARGE' });
  }
  return { json, hash: crypto.createHash('sha256').update(json).digest('hex') };
}

function requestOf(options) {
  return {
    prompt: options.prompt,
    requestedModel: options.model || null,
    sessionId: options.cognitiveSessionId || options.agentId,
    responseFormat: options.responseFormat || null,
    maxTokens: options.maxTokens || null,
    providerContinuityMode: options.providerContinuity?.mode || null
  };
}

function responseOf(result) {
  return {
    effectivePrompt: result?.cognitive?.routePrompt || result?.cognitive?.prompt || null,
    text: result?.text ?? null,
    toolCalls: result?.toolCalls || [],
    model: result?.model || null,
    provider: result?.provider || null,
    inputTokens: result?.inputTokens || 0,
    outputTokens: result?.outputTokens || 0,
    providerContinuity: sealedContinuity(result?.providerContinuity)
  };
}

function sealedContinuity(continuity) {
  if (!continuity) return null;
  const { responseId, ...metadata } = continuity;
  return { ...metadata, sealedResponseId: require('./secretVault').encrypt(responseId) };
}

function assertContinuationRequest(options) {
  if (options.providerContinuity.mode !== 'openai-responses' || !/^openai:\/\/.+/.test(options.model || '')) {
    throw Object.assign(new Error('Provider continuity requires one explicit OpenAI model.'),
      { code: 'PROVIDER_CONTINUATION_UNSUPPORTED' });
  }
  if (!options.db || !options.agentId || typeof options.db.exec !== 'function') {
    throw Object.assign(new Error('Provider continuity requires a durable agent session.'),
      { code: 'PROVIDER_CONTINUATION_SESSION_REQUIRED' });
  }
  if (!process.env.GENOS_SECRET_KEY) {
    throw Object.assign(new Error('Provider continuity requires GENOS_SECRET_KEY.'),
      { code: 'PROVIDER_CONTINUATION_KEY_REQUIRED' });
  }
}

function scopeArgs(options) {
  return [options.agentId, options.cognitiveSessionId || options.agentId,
    options.organizationId || null, options.projectId || null];
}

async function assertNoPending(db, args) {
  const pending = await db.get(`SELECT id FROM organism_model_turns
    WHERE agent_id = ? AND session_id = ? AND organization_id IS ? AND project_id IS ?
      AND status = 'pending' LIMIT 1`, ...args);
  if (pending) {
    throw Object.assign(new Error('A provider call is already in progress for this session.'),
      { code: 'PROVIDER_CONTINUATION_PENDING' });
  }
}

function unsealPrevious(stored, model) {
  if (!stored?.sealedResponseId) {
    throw Object.assign(new Error('Previous model turn has no provider continuation.'),
      { code: 'PROVIDER_CONTINUATION_UNAVAILABLE' });
  }
  let prior;
  try { prior = { ...stored, responseId: require('./secretVault').decrypt(stored.sealedResponseId) }; }
  catch (_) { throw Object.assign(new Error('Provider continuation cannot be decrypted.'),
    { code: 'PROVIDER_CONTINUATION_INVALID' }); }
  require('./modelProviderResponses').validatePrior(prior, model);
  return prior;
}

async function loadPrevious(db, args, model) {
  const row = await db.get(`SELECT response_json, response_hash FROM organism_model_turns
    WHERE agent_id = ? AND session_id = ? AND organization_id IS ? AND project_id IS ?
      AND status = 'completed' ORDER BY rowid DESC LIMIT 1`, ...args);
  if (!row) return null;
  if (!row.response_json || digestRaw(row.response_json) !== row.response_hash) {
    throw Object.assign(new Error('Provider continuation turn is corrupt.'),
      { code: 'PROVIDER_CONTINUATION_INVALID' });
  }
  let stored;
  try { stored = JSON.parse(row.response_json).providerContinuity; }
  catch (_) { throw Object.assign(new Error('Provider continuation turn is malformed.'),
    { code: 'PROVIDER_CONTINUATION_INVALID' }); }
  return unsealPrevious(stored, model);
}

async function prepareContinuation(options) {
  if (!options?.providerContinuity) return options;
  assertContinuationRequest(options);
  const args = scopeArgs(options);
  await assertNoPending(options.db, args);
  const prior = options.providerContinuity.reset === true
    ? null : await loadPrevious(options.db, args, options.model);
  return { ...options, providerContinuity: { mode: 'openai-responses', prior } };
}

async function runWithTurn(options, generateCore) {
  const start = async () => {
    const prepared = await prepareContinuation(options);
    return { prepared, turnId: await begin(prepared) };
  };
  const { prepared, turnId } = options?.providerContinuity
    ? await require('../db').withTransaction(options.db, start) : await start();
  try {
    const result = await generateCore(prepared);
    await complete(prepared?.db, turnId, result);
    if (!result?.providerContinuity) return result;
    const { responseId: _secret, ...publicContinuity } = result.providerContinuity;
    return { ...result, providerContinuity: publicContinuity };
  } catch (error) {
    await fail(prepared?.db, turnId, error);
    throw error;
  }
}

async function begin(options) {
  if (!options?.db || !options.agentId || typeof options.db.exec !== 'function') return null;
  const request = encoded(requestOf(options));
  const id = crypto.randomUUID();
  await options.db.run(
    `INSERT INTO organism_model_turns
      (id, agent_id, session_id, organization_id, project_id, status, request_json, request_hash)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    id, options.agentId, options.cognitiveSessionId || options.agentId,
    options.organizationId || null, options.projectId || null, request.json, request.hash
  );
  return id;
}

async function complete(db, id, result) {
  if (!id) return;
  const response = encoded(responseOf(result));
  const updated = await db.run(
    `UPDATE organism_model_turns SET status = 'completed', response_json = ?, response_hash = ?,
      completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`,
    response.json, response.hash, id
  );
  if (updated?.changes === 0) throw new Error('Model context turn disappeared before completion.');
}

async function fail(db, id, error) {
  if (!id) return;
  await db.run(
    `UPDATE organism_model_turns SET status = 'failed', error_code = ?,
      completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`,
    String(error?.code || 'MODEL_ROUTE_FAILED').slice(0, 100), id
  );
}

module.exports = { begin, complete, fail, encoded, prepareContinuation, runWithTurn };
