function firstTruthy(...values) {
  for (const value of values) {
    if (value) return value;
  }
  return undefined;
}

function firstNonNull(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function promptText(prompt) {
  return typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
}

function tokenize(text = '') { return String(text).trim().split(/\s+/).filter(Boolean); }

function estimateTokenCount(text = '') {
  const value = String(text || '');
  return value.length ? Math.max(1, Math.ceil(Buffer.byteLength(value, 'utf8') / 4)) : 0;
}

function normalizeMessageContent(content) {
  if (typeof content === 'string') return { text: content, toolCalls: [] };
  if (!Array.isArray(content)) return { text: '', toolCalls: [] };
  const text = content.map((part) => typeof part === 'string' ? part : part?.text || '').join('');
  const toolCalls = content.filter((part) => part && (part.type === 'tool_use' || part.type === 'tool_call'));
  return { text, toolCalls };
}

function parseStructuredResponse(text, responseFormat) {
  if (responseFormat !== 'json_object') return null;
  try { return JSON.parse(text); } catch (_) { throw new Error('Provider returned invalid structured JSON.'); }
}

function buildHeaders(provider, apiKey, computerUse) {
  const headers = { 'Content-Type': 'application/json' };
  if (provider === 'anthropic') {
    if (apiKey) headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    if (computerUse) headers['anthropic-beta'] = 'computer-use-2024-10-22';
  } else if (provider === 'gemini') {
    if (apiKey) headers['x-goog-api-key'] = apiKey;
  } else if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

function buildAnthropicBody(params) {
  const { modelName, prompt, outputLimit, computerUse, displayWidth, displayHeight } = params;
  return {
    model: modelName,
    max_tokens: outputLimit || 8192,
    messages: [{ role: 'user', content: prompt }],
    ...(computerUse ? { tools: [{ type: "computer_20241022", name: "computer", display_width_px: displayWidth, display_height_px: displayHeight, display_number: 1 }] } : {})
  };
}

function buildGeminiBody(params) {
  const { prompt, outputLimit } = params;
  return {
    contents: [{ parts: Array.isArray(prompt) ? prompt.map((p) => p.text ? { text: p.text } : p) : [{ text: prompt }] }],
    ...(outputLimit ? { generationConfig: { maxOutputTokens: outputLimit } } : {})
  };
}

function buildOpenAiBody(params) {
  const { modelName, prompt, stream, outputLimit, seed, responseFormat, nativeOllama } = params;
  if (nativeOllama) {
    return { model: modelName, messages: [{ role: 'user', content: prompt }], stream, ...(outputLimit || seed != null ? { options: { ...(outputLimit ? { num_predict: outputLimit } : {}), ...(Number.isInteger(Number(seed)) ? { seed: Number(seed) } : {}) } } : {}) };
  }
  return { model: modelName, messages: [{ role: 'user', content: prompt }], stream, ...(outputLimit ? { max_tokens: outputLimit } : {}), ...(Number.isInteger(Number(seed)) ? { seed: Number(seed) } : {}), ...(responseFormat ? { response_format: { type: responseFormat } } : {}) };
}

function buildRequestBody(params) {
  if (params.provider === 'anthropic') return buildAnthropicBody(params);
  if (params.provider === 'gemini') return buildGeminiBody(params);
  return buildOpenAiBody(params);
}

function sseDelta(payload) {
  const choice = payload.choices?.[0];
  const content = choice?.delta?.content;
  return firstTruthy(content, payload.response, '');
}

function parseSseLine(line) {
  if (!line.startsWith('data:')) return null;
  const data = line.slice(5).trim();
  if (!data || data === '[DONE]') return null;
  try { return JSON.parse(data); } catch (_) {
    throw Object.assign(new Error('Model provider returned malformed SSE JSON.'), { code: 'MODEL_PROVIDER_MALFORMED_STREAM' });
  }
}

function parseNdjsonLine(line) {
  if (!line.trim()) return null;
  try { return JSON.parse(line); } catch (_) {
    throw Object.assign(new Error('Model provider returned malformed NDJSON.'), { code: 'MODEL_PROVIDER_MALFORMED_STREAM' });
  }
}

async function consumeSse(ctx, chunk) {
  ctx.state.buffer += ctx.decoder.decode(chunk, { stream: true });
  const lines = ctx.state.buffer.split(/\r?\n/);
  ctx.state.buffer = lines.pop() || '';
  for (const line of lines) {
    const payload = parseSseLine(line);
    if (!payload) continue;
    if (payload.model) ctx.state.servedModel = payload.model;
    const delta = sseDelta(payload);
    if (delta) { ctx.state.text += delta; await ctx.onToken(delta); }
    if (payload.usage) ctx.state.usage = payload.usage;
  }
}

async function consumeNdjson(ctx, chunk) {
  ctx.state.buffer += ctx.decoder.decode(chunk, { stream: true });
  const lines = ctx.state.buffer.split(/\r?\n/);
  ctx.state.buffer = lines.pop() || '';
  for (const line of lines) {
    const payload = parseNdjsonLine(line);
    if (!payload) continue;
    if (payload.model) ctx.state.servedModel = payload.model;
    const delta = firstTruthy(payload.message?.content, payload.response, '');
    if (delta) { ctx.state.text += delta; await ctx.onToken(delta); }
    if (payload.prompt_eval_count != null || payload.eval_count != null) {
      ctx.state.usage = { prompt_tokens: payload.prompt_eval_count, completion_tokens: payload.eval_count };
    }
  }
}

function pumpStream(reader, consume, idleTimeoutMs) {
  const loop = async () => {
    while (true) {
      let idleTimer;
      const idleTimeout = new Promise((_, reject) => { idleTimer = setTimeout(() => reject(new Error(`Model stream idle timeout after ${idleTimeoutMs}ms.`)), idleTimeoutMs); });
      const next = await Promise.race([reader.read(), idleTimeout]);
      clearTimeout(idleTimer);
      if (next.done) break;
      await consume(next.value);
    }
  };
  return loop().finally(async () => {
    try { reader.releaseLock(); } catch (_) {}
    try { await reader.cancel(); } catch (_) {}
  });
}

async function readStreamingResponse(response, onToken, idleTimeoutMs = 30000) {
  const reader = response.body?.getReader ? response.body.getReader() : null;
  if (!reader) return null;
  const ctx = { decoder: new TextDecoder(), state: { buffer: '', text: '', usage: {}, servedModel: null }, onToken };
  const consume = async (chunk) => { await consumeSse(ctx, chunk); };
  await pumpStream(reader, consume, idleTimeoutMs);
  if (ctx.state.buffer.startsWith('data:')) await consume(new TextEncoder().encode(`${ctx.state.buffer}\n`));
  return { text: ctx.state.text, usage: ctx.state.usage, servedModel: ctx.state.servedModel };
}

async function readOllamaStream(response, onToken, idleTimeoutMs = 30000) {
  const reader = response.body?.getReader ? response.body.getReader() : null;
  if (!reader) return { text: '', usage: {} };
  const ctx = { decoder: new TextDecoder(), state: { buffer: '', text: '', usage: {}, servedModel: null }, onToken };
  const consume = async (chunk) => { await consumeNdjson(ctx, chunk); };
  await pumpStream(reader, consume, idleTimeoutMs);
  if (ctx.state.buffer.trim()) await consume(new TextEncoder().encode(`${ctx.state.buffer}\n`));
  return { text: ctx.state.text, usage: ctx.state.usage, servedModel: ctx.state.servedModel };
}

function anthropicContent(payload) { return payload.content; }

function geminiContent(payload) { return payload.candidates?.[0]?.content?.parts; }

function ollamaContent(payload) { return firstTruthy(payload.message?.content, payload.response, ''); }

function openAiContent(payload) { return firstTruthy(payload.choices?.[0]?.message?.content, ''); }

const CONTENT_RESOLVERS = { anthropic: anthropicContent, gemini: geminiContent };

function resolveResponseContent(provider, payload, nativeOllama) {
  const resolver = CONTENT_RESOLVERS[provider];
  if (resolver) return resolver(payload);
  return nativeOllama ? ollamaContent(payload) : openAiContent(payload);
}

function buildStreamResponse(streamed, context) {
  return {
    text: streamed.text,
    inputTokens: firstNonNull(streamed.usage && streamed.usage.prompt_tokens, estimateTokenCount(promptText(context.options.prompt))),
    outputTokens: firstNonNull(streamed.usage && streamed.usage.completion_tokens, estimateTokenCount(streamed.text)),
    provider: context.provider,
    servedModel: firstTruthy(streamed.servedModel, context.modelName)
  };
}

/**
 * Streaming output is speculative; validated output is authoritative.
 * When enforceSchema is true, parse the accumulated text locally
 * regardless of provider-native structured support.
 */
function attachSchemaValidation(result, text) {
  let schema;
  try {
    schema = require('./agentOutputSchemaService');
  } catch {
    return result;
  }
  const parsed = schema.parseAndValidate(text || '');
  if (parsed.ok) {
    result.structured = parsed.output;
    return result;
  }
  if (parsed.error === 'OUTPUT_SCHEMA_VIOLATION') {
    result.structured = schema.repairOutput(schema.extractJson?.(text) || {});
    result.schemaViolation = { error: 'OUTPUT_SCHEMA_VIOLATION', violations: parsed.violations };
  }
  return result;
}

function buildFinalResponse(info) {
  const usage = info.payload.usage || {};
  return {
    text: info.text,
    toolCalls: info.toolCalls,
    structured: parseStructuredResponse(info.text, info.responseFormat),
    inputTokens: firstNonNull(usage.input_tokens, usage.prompt_tokens, estimateTokenCount(promptText(info.prompt))),
    outputTokens: firstNonNull(usage.output_tokens, usage.completion_tokens, estimateTokenCount(info.text)),
    provider: info.provider,
    servedModel: firstTruthy(info.payload.model, info.modelName)
  };
}

function isStreamable(context, contentType) {
  if (!context.options.stream) return false;
  if (context.configuration.provider === 'anthropic' || context.configuration.provider === 'gemini') return false;
  return /(?:text\/event-stream|application\/x-ndjson|application\/ndjson)/i.test(contentType);
}

module.exports = {
  tokenize,
  estimateTokenCount,
  normalizeMessageContent,
  buildHeaders,
  buildRequestBody,
  resolveResponseContent,
  buildStreamResponse,
  attachSchemaValidation,
  buildFinalResponse,
  readStreamingResponse,
  readOllamaStream,
  isStreamable
};
