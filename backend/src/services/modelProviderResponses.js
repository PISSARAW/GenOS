const { attachSchemaValidation, providerUsageReceipt } = require('./modelProviderRequest');

const ENDPOINT = 'https://api.openai.com/v1/responses';
const MODE = 'openai-responses';

function responseText(payload) {
  return (payload.output || [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text || '')
    .join('');
}

function responseFormat(format) {
  if (format === 'json_object') return { type: 'json_object' };
  if (format?.schema) return { type: 'json_schema', name: format.name || 'structured_response',
    schema: format.schema, strict: false };
  return null;
}

function validatePrior(prior, model) {
  if (!prior) return null;
  if (prior.mode !== MODE || prior.model !== model || !/^resp_[A-Za-z0-9_-]+$/.test(prior.responseId || '')) {
    throw Object.assign(new Error('Provider continuation does not match the selected model.'),
      { code: 'PROVIDER_CONTINUATION_MISMATCH' });
  }
  if (prior.expiresAt && Date.parse(prior.expiresAt) <= Date.now()) {
    throw Object.assign(new Error('Provider continuation has expired.'),
      { code: 'PROVIDER_CONTINUATION_EXPIRED' });
  }
  return prior.responseId;
}

function normalizeResponse(payload, options) {
  assertCompleted(payload);
  const text = responseText(payload);
  const expiresAt = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString();
  const result = {
    text, toolCalls: (payload.output || []).filter((item) => item.type === 'function_call'),
    provider: 'openai', servedModel: payload.model || options.modelName,
    inputTokens: payload.usage?.input_tokens || 0,
    outputTokens: payload.usage?.output_tokens || 0,
    tokenUsageMeasured: Boolean(payload.usage),
    providerContinuity: { mode: MODE, model: options.model,
      responseId: payload.id, expiresAt, applied: Boolean(options.prior) }
  };
  if (result.toolCalls.length) {
    throw Object.assign(new Error('OpenAI Responses tool calls need an explicit output handoff.'),
      { code: 'PROVIDER_CONTINUATION_TOOL_HANDOFF_UNSUPPORTED' });
  }
  const usageReceipt = providerUsageReceipt(payload.id, payload.usage);
  if (usageReceipt) result.usageReceipt = usageReceipt;
  attachStructured(result, options, text);
  return options.enforceSchema === false ? result : attachSchemaValidation(result, text);
}

function assertCompleted(payload) {
  if (!/^resp_[A-Za-z0-9_-]+$/.test(payload.id || '') || payload.status !== 'completed') {
    throw Object.assign(new Error('OpenAI response has no completed continuation reference.'),
      { code: 'PROVIDER_CONTINUATION_UNAVAILABLE' });
  }
}

function attachStructured(result, options, text) {
  if (options.responseFormat === 'json_object' || options.responseFormat?.schema) {
    try { result.structured = JSON.parse(text); } catch (_) {
      throw Object.assign(new Error('Provider returned invalid structured JSON.'),
        { code: 'MODEL_PROVIDER_INVALID_JSON' });
    }
  }
}

async function generate(options) {
  if (options.endpoint && ![ENDPOINT, 'https://api.openai.com/v1/chat/completions'].includes(options.endpoint)) {
    throw Object.assign(new Error('OpenAI Responses continuity requires the official endpoint.'),
      { code: 'PROVIDER_CONTINUATION_ENDPOINT_UNSUPPORTED' });
  }
  const priorId = validatePrior(options.prior, options.model);
  const body = { model: options.modelName, input: options.prompt,
    store: true, stream: false,
    ...(priorId ? { previous_response_id: priorId } : {}),
    ...(options.maxTokens ? { max_output_tokens: options.maxTokens } : {}),
    ...(responseFormat(options.responseFormat) ? { text: { format: responseFormat(options.responseFormat) } } : {}) };
  const response = await fetch(ENDPOINT, { method: 'POST', signal: options.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
    body: JSON.stringify(body) });
  if (!response.ok) {
    throw Object.assign(new Error(`OpenAI Responses returned HTTP ${response.status}.`),
      { code: 'PROVIDER_CONTINUATION_REQUEST_FAILED' });
  }
  const result = normalizeResponse(await response.json(), options);
  if (result.text) await options.onToken(result.text);
  return result;
}

module.exports = { generate, validatePrior, MODE };
