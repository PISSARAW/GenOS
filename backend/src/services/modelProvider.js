const inferenceGateway = require('./inferenceGatewayService');
const { validateProviderEndpoint } = require('./providerEndpointPolicy');
const fs = require('fs');
const path = require('path');

const SUPPORTED_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'mistral', 'groq', 'deepseek', 'together', 'openrouter', 'ollama', 'lmstudio', 'vllm', 'openai-compatible']);

function loadEnvironmentFile() {
  const filePath = path.resolve(__dirname, '../../../.env');
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function applyLegacyModelConfiguration() {
  if (!process.env.GENOS_DEFAULT_MODEL && process.env.LLM_PROVIDER && process.env.OLLAMA_MODEL) {
    const provider = String(process.env.LLM_PROVIDER).trim().toLowerCase();
    if (!SUPPORTED_PROVIDERS.has(provider)) {
      const error = new Error(`Unsupported legacy model provider '${process.env.LLM_PROVIDER}'.`);
      error.code = 'INVALID_MODEL_PROVIDER';
      throw error;
    }
    process.env.GENOS_DEFAULT_MODEL = `${provider}://${process.env.OLLAMA_MODEL}`;
  }
  if (!process.env.GENOS_OLLAMA_ENDPOINT && process.env.OLLAMA_API_URL) {
    process.env.GENOS_OLLAMA_ENDPOINT = `${process.env.OLLAMA_API_URL.replace(/\/$/, '')}/v1/chat/completions`;
  }
}

loadEnvironmentFile();
applyLegacyModelConfiguration();

function tokenize(text = '') { return String(text).trim().split(/\s+/).filter(Boolean); }

function isSupportedProvider(provider) {
  return SUPPORTED_PROVIDERS.has(String(provider || '').trim().toLowerCase());
}

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

function configuredModel(model) {
  let value = String(model || process.env.GENOS_DEFAULT_MODEL || '').trim();
  if (value.startsWith('local://')) {
    value = `ollama://${value.slice(8)}`;
  }
  if (!value) throw new Error('No model provider is configured. Set GENOS_DEFAULT_MODEL or LLM_PROVIDER plus its model variable.');
  if (!new RegExp(`^(?:${[...SUPPORTED_PROVIDERS].join('|')}):\\/\\/`).test(value)) {
    throw new Error(`Unsupported model URI '${value}'. Use OpenAI, Anthropic, Gemini, Mistral, Groq, DeepSeek, Together, OpenRouter, Ollama, LM Studio, vLLM, or OpenAI-compatible syntax.`);
  }
  return value;
}

function resolveProviderApiKey(provider) {
  switch (provider) {
    case 'anthropic': return process.env.ANTHROPIC_API_KEY;
    case 'gemini': return process.env.GEMINI_API_KEY;
    case 'mistral': return process.env.MISTRAL_API_KEY;
    case 'groq': return process.env.GROQ_API_KEY || process.env.GENOS_MODEL_API_KEY;
    case 'deepseek': return process.env.DEEPSEEK_API_KEY || process.env.GENOS_MODEL_API_KEY;
    case 'together': return process.env.TOGETHER_API_KEY || process.env.GENOS_MODEL_API_KEY;
    case 'openrouter': return process.env.OPENROUTER_API_KEY || process.env.GENOS_MODEL_API_KEY;
    default: return process.env.GENOS_MODEL_API_KEY || process.env.OPENAI_API_KEY;
  }
}

function assertSafeProviderEndpoint(endpoint) {
  let parsed;
  try { parsed = new URL(String(endpoint)); } catch (_) { throw new Error('Model provider endpoint must be a valid URL.'); }
  const hostname = parsed.hostname.toLowerCase();
  const blocked = hostname === 'metadata.google.internal'
    || hostname === '169.254.169.254'
    || hostname === '100.100.100.200'
    || /^169\.254\.(?:\d{1,3}\.)\d{1,3}$/.test(hostname);
  if (blocked) throw new Error('Model provider endpoint targets a blocked metadata or link-local address.');
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Model provider endpoint must use HTTP or HTTPS.');
  return endpoint;
}

function modelConfiguration(model, endpointOverride) {
  const uri = configuredModel(model);
  const match = uri.match(/^([\w-]+):\/\/(.+)$/);
  const provider = match[1]; const modelName = match[2];
  const explicitEndpoint = provider === 'openai-compatible' && (endpointOverride || process.env.GENOS_OPENAI_COMPATIBLE_ENDPOINT || process.env.GENOS_MODEL_ENDPOINT);
  if (provider === 'openai-compatible' && !explicitEndpoint) {
    throw new Error('GENOS_OPENAI_COMPATIBLE_ENDPOINT or GENOS_MODEL_ENDPOINT is required for openai-compatible models.');
  }
  const local = ['ollama', 'lmstudio', 'vllm'].includes(provider) || Boolean(explicitEndpoint && /^(http:\/\/localhost|http:\/\/127\.0\.0\.1|http:\/\/0\.0\.0\.0)/.test(explicitEndpoint));
  const apiKey = resolveProviderApiKey(provider);
  const endpoint = provider === 'anthropic' ? (process.env.ANTHROPIC_API_ENDPOINT || 'https://api.anthropic.com/v1/messages')
    : provider === 'gemini' ? (process.env.GEMINI_API_ENDPOINT || `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`)
      : provider === 'mistral' ? (process.env.MISTRAL_API_ENDPOINT || 'https://api.mistral.ai/v1/chat/completions')
        : provider === 'groq' ? (process.env.GROQ_API_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions')
          : provider === 'deepseek' ? (process.env.DEEPSEEK_API_ENDPOINT || 'https://api.deepseek.com/v1/chat/completions')
            : provider === 'together' ? (process.env.TOGETHER_API_ENDPOINT || 'https://api.together.xyz/v1/chat/completions')
              : provider === 'openrouter' ? (process.env.OPENROUTER_API_ENDPOINT || 'https://openrouter.ai/api/v1/chat/completions')
                : provider === 'ollama' ? (process.env.GENOS_OLLAMA_ENDPOINT || 'http://localhost:11434/v1/chat/completions')
                  : provider === 'lmstudio' ? (process.env.GENOS_LMSTUDIO_ENDPOINT || 'http://localhost:1234/v1/chat/completions')
                    : provider === 'vllm' ? (process.env.GENOS_VLLM_ENDPOINT || 'http://localhost:8000/v1/chat/completions')
                      : (endpointOverride || process.env.GENOS_OPENAI_COMPATIBLE_ENDPOINT || process.env.GENOS_MODEL_ENDPOINT || 'https://api.openai.com/v1/chat/completions');
    validateProviderEndpoint(endpoint, { localOnly: ['ollama', 'lmstudio', 'vllm'].includes(provider) });
    assertSafeProviderEndpoint(endpoint);
    return { uri, provider, modelName, endpoint, configured: local || Boolean(apiKey), keySource: apiKey ? `${provider.toUpperCase()}_API_KEY` : null };
}

async function generate({ model, prompt = '', onToken = () => {}, timeoutMs = 30000, maxTokens, endpoint: endpointOverride, priority = 'bulk', agentId, organizationId, projectId, seed, stream = true, signal, displayWidth = 1920, displayHeight = 1080, responseFormat }) {
  const effectiveTimeout = Number.isFinite(Number(timeoutMs)) ? Math.max(1, Math.min(Number(timeoutMs), 30 * 60 * 1000)) : 30000;
  const configuration = modelConfiguration(model, endpointOverride);
  // Local inference goes through the gateway's bounded queue: concurrent
  // agents must queue for the GPU instead of stampeding it. Cloud providers
  // have their own rate limits and bypass the queue.
  const targetEndpoint = endpointOverride || configuration.endpoint;
  if (inferenceGateway.isLocalProvider(configuration.provider, targetEndpoint)) {
    return inferenceGateway.schedule(
      () => generateDirect({ model, prompt, onToken, timeoutMs: effectiveTimeout, maxTokens, endpoint: endpointOverride, agentId, seed, stream, signal, displayWidth, displayHeight, responseFormat }),
      { provider: configuration.provider, priority, agentId, organizationId, projectId }
    );
  }
  return generateDirect({ model, prompt, onToken, timeoutMs: effectiveTimeout, maxTokens, endpoint: endpointOverride, agentId, seed, stream, signal, displayWidth, displayHeight, responseFormat });
}

async function readStreamingResponse(response, onToken, idleTimeoutMs = 30000) {
  const reader = response.body?.getReader ? response.body.getReader() : null;
  if (!reader) return null;
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let usage = {};
  let servedModel = null;
  const consume = async (chunk) => {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let payload;
      try { payload = JSON.parse(data); } catch (_) {
        throw Object.assign(new Error('Model provider returned malformed SSE JSON.'), { code: 'MODEL_PROVIDER_MALFORMED_STREAM' });
      }
      if (payload.model) servedModel = payload.model;
      const delta = payload.choices?.[0]?.delta?.content || payload.response || '';
      if (delta) { text += delta; await onToken(delta); }
      if (payload.usage) usage = payload.usage;
    }
  };
  while (true) {
    let idleTimer;
    const idleTimeout = new Promise((_, reject) => {
      idleTimer = setTimeout(() => reject(new Error(`Model stream idle timeout after ${idleTimeoutMs}ms.`)), idleTimeoutMs);
    });
    const next = await Promise.race([reader.read(), idleTimeout]);
    clearTimeout(idleTimer);
    if (next.done) break;
    await consume(next.value);
  }
  if (buffer.startsWith('data:')) await consume(new TextEncoder().encode(`${buffer}\n`));
  return { text, usage, servedModel };
}

async function readOllamaStream(response, onToken, idleTimeoutMs = 30000) {
  const reader = response.body?.getReader ? response.body.getReader() : null;
  if (!reader) return { text: '', usage: {} };
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let usage = {};
  let servedModel = null;
  const consume = async (chunk) => {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let payload;
      try { payload = JSON.parse(line); } catch (_) {
        throw Object.assign(new Error('Model provider returned malformed NDJSON.'), { code: 'MODEL_PROVIDER_MALFORMED_STREAM' });
      }
      if (payload.model) servedModel = payload.model;
      const delta = payload.message?.content || payload.response || '';
      if (delta) { text += delta; await onToken(delta); }
      if (payload.prompt_eval_count != null || payload.eval_count != null) {
        usage = { prompt_tokens: payload.prompt_eval_count, completion_tokens: payload.eval_count };
      }
    }
  };
  while (true) {
    let idleTimer;
    const idleTimeout = new Promise((_, reject) => { idleTimer = setTimeout(() => reject(new Error(`Model stream idle timeout after ${idleTimeoutMs}ms.`)), idleTimeoutMs); });
    const next = await Promise.race([reader.read(), idleTimeout]);
    clearTimeout(idleTimer);
    if (next.done) break;
    await consume(next.value);
  }
  if (buffer.trim()) await consume(new TextEncoder().encode(`${buffer}\n`));
  return { text, usage, servedModel };
}

async function generateDirect({ model, prompt = '', onToken = () => {}, timeoutMs = 30000, maxTokens, endpoint: endpointOverride, seed, stream = true, signal, displayWidth = 1920, displayHeight = 1080, computerUse = false, responseFormat }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  try {
    const configuration = modelConfiguration(model, endpointOverride);
    const { uri: resolvedModel, provider, modelName, endpoint: configuredEndpoint, configured: isConfigured } = configuration;
    const endpoint = endpointOverride || configuredEndpoint;
    validateProviderEndpoint(endpoint, { localOnly: ['ollama', 'lmstudio', 'vllm'].includes(provider) });
    assertSafeProviderEndpoint(endpoint);
    const apiKey = resolveProviderApiKey(provider);
    if (!isConfigured || (!apiKey && !['ollama', 'lmstudio', 'vllm', 'openai-compatible'].includes(provider))) throw new Error(`No API key configured for model ${resolvedModel}.`);
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
    const outputLimit = Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0 ? Math.floor(Number(maxTokens)) : null;
    const nativeOllama = provider === 'ollama' && /\/api\/chat\/?$/i.test(endpoint);
    let body;
    if (provider === 'anthropic') {
      body = {
        model: modelName,
        max_tokens: outputLimit || 2048,
        messages: [{ role: 'user', content: prompt }],
        ...(computerUse ? { tools: [{ type: "computer_20241022", name: "computer", display_width_px: displayWidth, display_height_px: displayHeight, display_number: 1 }] } : {})
      };
    } else if (provider === 'gemini') {
      body = {
        contents: [{ parts: Array.isArray(prompt) ? prompt.map(p => p.text ? { text: p.text } : p) : [{ text: prompt }] }],
        ...(outputLimit ? { generationConfig: { maxOutputTokens: outputLimit } } : {})
      };
    } else {
      body = nativeOllama
        ? { model: modelName, messages: [{ role: 'user', content: prompt }], stream, ...(outputLimit || seed != null ? { options: { ...(outputLimit ? { num_predict: outputLimit } : {}), ...(Number.isInteger(Number(seed)) ? { seed: Number(seed) } : {}) } } : {}) }
        : { model: modelName, messages: [{ role: 'user', content: prompt }], stream, ...(outputLimit ? { max_tokens: outputLimit } : {}), ...(Number.isInteger(Number(seed)) ? { seed: Number(seed) } : {}), ...(responseFormat ? { response_format: { type: responseFormat } } : {}) };
    }
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Model provider returned HTTP ${response.status}.${detail ? ` ${detail.slice(0, 500)}` : ''}`);
    }
    const contentType = response.headers?.get?.('content-type') || '';
    if (nativeOllama && stream) {
      const streamed = await readOllamaStream(response, onToken, Math.min(timeoutMs, 30000));
      return { text: streamed.text, inputTokens: streamed.usage?.prompt_tokens || estimateTokenCount(typeof prompt === 'string' ? prompt : JSON.stringify(prompt)), outputTokens: streamed.usage?.completion_tokens || estimateTokenCount(streamed.text), provider, servedModel: streamed.servedModel || modelName };
    }
    if (stream && provider !== 'anthropic' && provider !== 'gemini' && /(?:text\/event-stream|application\/x-ndjson|application\/ndjson)/i.test(contentType)) {
      const streamed = await readStreamingResponse(response, onToken, Math.min(timeoutMs, 30000));
      return { text: streamed.text, inputTokens: streamed.usage?.prompt_tokens || tokenize(typeof prompt === 'string' ? prompt : JSON.stringify(prompt)).length, outputTokens: streamed.usage?.completion_tokens || tokenize(streamed.text).length, provider, servedModel: streamed.servedModel || modelName };
    }
    const payload = await response.json();
    const content = provider === 'anthropic' ? payload.content : provider === 'gemini' ? payload.candidates?.[0]?.content?.parts : nativeOllama ? payload.message?.content || payload.response || '' : payload.choices?.[0]?.message?.content || '';
    const normalized = normalizeMessageContent(content);
    const text = normalized.text;
    for (const token of tokenize(text)) await onToken(token);
    return { text, toolCalls: normalized.toolCalls, structured: parseStructuredResponse(text, responseFormat), inputTokens: payload.usage?.input_tokens ?? payload.usage?.prompt_tokens ?? estimateTokenCount(typeof prompt === 'string' ? prompt : JSON.stringify(prompt)), outputTokens: payload.usage?.output_tokens ?? payload.usage?.completion_tokens ?? estimateTokenCount(text), provider, servedModel: payload.model || modelName };
  } catch (error) {
    controller.abort();
    if (error.name === 'AbortError') throw new Error(`Model timeout after ${timeoutMs}ms.`);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function getModelStatus(model) {
  try {
    const configuration = modelConfiguration(model);
    return { ...configuration, apiKeyConfigured: configuration.configured && (['ollama', 'lmstudio', 'vllm', 'openai-compatible'].includes(configuration.provider) || Boolean(configuration.keySource)) };
  } catch (error) { return { configured: false, apiKeyConfigured: false, error: error.message }; }
}

module.exports = { generate, tokenize, estimateTokenCount, normalizeMessageContent, configuredModel, modelConfiguration, getModelStatus, assertSafeProviderEndpoint, isSupportedProvider };
