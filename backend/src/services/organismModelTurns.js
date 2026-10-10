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
    maxTokens: options.maxTokens || null
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
    outputTokens: result?.outputTokens || 0
  };
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

module.exports = { begin, complete, fail, encoded };
