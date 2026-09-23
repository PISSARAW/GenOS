const inferenceGateway = require('./inferenceGatewayService');
const { validateProviderEndpoint, validateProviderEndpointAsync } = require('./providerEndpointPolicy');
const {
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
} = require('./modelProviderRequest');
const fs = require('fs');
const path = require('path');

const SUPPORTED_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'mistral', 'groq', 'deepseek', 'together', 'openrouter', 'ollama', 'lmstudio', 'vllm', 'openai-compatible']);
const LOCAL_PROVIDERS = ['ollama', 'lmstudio', 'vllm'];
const LOCAL_OR_COMPATIBLE = ['ollama', 'lmstudio', 'vllm', 'openai-compatible'];

const API_KEY_ENV = {
  anthropic: ['ANTHROPIC_API_KEY'],
  gemini: ['GEMINI_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  groq: ['GROQ_API_KEY', 'GENOS_MODEL_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY', 'GENOS_MODEL_API_KEY'],
  together: ['TOGETHER_API_KEY', 'GENOS_MODEL_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY', 'GENOS_MODEL_API_KEY']
};
const DEFAULT_KEY_ENV = ['GENOS_MODEL_API_KEY', 'OPENAI_API_KEY'];

const PROVIDER_ENDPOINTS = {
  anthropic: () => process.env.ANTHROPIC_API_ENDPOINT || 'https://api.anthropic.com/v1/messages',
  gemini: (modelName) => process.env.GEMINI_API_ENDPOINT || `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
  mistral: () => process.env.MISTRAL_API_ENDPOINT || 'https://api.mistral.ai/v1/chat/completions',
  groq: () => process.env.GROQ_API_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions',
  deepseek: () => process.env.DEEPSEEK_API_ENDPOINT || 'https://api.deepseek.com/v1/chat/completions',
  together: () => process.env.TOGETHER_API_ENDPOINT || 'https://api.together.xyz/v1/chat/completions',
  openrouter: () => process.env.OPENROUTER_API_ENDPOINT || 'https://openrouter.ai/api/v1/chat/completions',
  ollama: () => process.env.GENOS_OLLAMA_ENDPOINT || 'http://localhost:11434/v1/chat/completions',
  lmstudio: () => process.env.GENOS_LMSTUDIO_ENDPOINT || 'http://localhost:1234/v1/chat/completions',
  vllm: () => process.env.GENOS_VLLM_ENDPOINT || 'http://localhost:8000/v1/chat/completions'
};

function firstTruthy(...values) {
  for (const value of values) {
    if (value) return value;
  }
  return undefined;
}

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

function isSupportedProvider(provider) {
  return SUPPORTED_PROVIDERS.has(String(provider || '').trim().toLowerCase());
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
  const keys = API_KEY_ENV[provider] || DEFAULT_KEY_ENV;
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return undefined;
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

function isLocalEndpoint(explicitEndpoint) {
  return Boolean(explicitEndpoint && /^(http:\/\/localhost|http:\/\/127\.0\.0\.1|http:\/\/0\.0\.0\.0)/.test(explicitEndpoint));
}

function resolveEndpoint(provider, modelName, endpointOverride) {
  const builder = PROVIDER_ENDPOINTS[provider];
  if (builder) return builder(modelName);
  return firstTruthy(endpointOverride, process.env.GENOS_OPENAI_COMPATIBLE_ENDPOINT, process.env.GENOS_MODEL_ENDPOINT, 'https://api.openai.com/v1/chat/completions');
}

function modelConfiguration(model, endpointOverride) {
  const uri = configuredModel(model);
  const match = uri.match(/^([\w-]+):\/\/(.+)$/);
  const provider = match[1]; const modelName = match[2];
  const explicitEndpoint = provider === 'openai-compatible' && firstTruthy(endpointOverride, process.env.GENOS_OPENAI_COMPATIBLE_ENDPOINT, process.env.GENOS_MODEL_ENDPOINT);
  if (provider === 'openai-compatible' && !explicitEndpoint) {
    throw new Error('GENOS_OPENAI_COMPATIBLE_ENDPOINT or GENOS_MODEL_ENDPOINT is required for openai-compatible models.');
  }
  const local = LOCAL_PROVIDERS.includes(provider) || isLocalEndpoint(explicitEndpoint);
  const apiKey = resolveProviderApiKey(provider);
  const endpoint = resolveEndpoint(provider, modelName, endpointOverride);
  validateProviderEndpoint(endpoint, { localOnly: LOCAL_PROVIDERS.includes(provider) });
  assertSafeProviderEndpoint(endpoint);
  return { uri, provider, modelName, endpoint, configured: local || Boolean(apiKey), keySource: apiKey ? `${provider.toUpperCase()}_API_KEY` : null };
}

function assertModelConfigured(configuration, apiKey) {
  if (configuration.configured && (apiKey || LOCAL_OR_COMPATIBLE.includes(configuration.provider))) return;
  throw new Error(`No API key configured for model ${configuration.uri}.`);
}

function validateStructuredCandidate(candidate) {
  const { validateOutput, repairOutput } = require('./agentOutputSchemaService');
  let violations = validateOutput(candidate);
  if (!violations.length) return { structured: candidate };
  const repaired = repairOutput(candidate);
  violations = validateOutput(repaired);
  if (!violations.length) return { structured: repaired };
  return { structured: repaired, schemaViolation: { error: 'OUTPUT_SCHEMA_VIOLATION', violations } };
}

async function consumeOllamaStream(context, response, idleTimeoutMs) {
  const streamed = await readOllamaStream(response, context.options.onToken, idleTimeoutMs);
  const result = buildStreamResponse(streamed, { options: context.options, provider: context.configuration.provider, modelName: context.configuration.modelName });
  if (context.options.enforceSchema !== false) return attachSchemaValidation(result, streamed.text);
  return result;
}

async function consumeTextStream(context, response, idleTimeoutMs) {
  const streamed = await readStreamingResponse(response, context.options.onToken, idleTimeoutMs);
  const result = buildStreamResponse(streamed, { options: context.options, provider: context.configuration.provider, modelName: context.configuration.modelName });
  if (context.options.enforceSchema !== false) return attachSchemaValidation(result, streamed.text);
  return result;
}

async function consumeJsonResponse(context, response) {
  const payload = await response.json();
  const content = resolveResponseContent(context.configuration.provider, payload, context.nativeOllama);
  const normalized = normalizeMessageContent(content);
  const text = normalized.text;
  for (const token of tokenize(text)) await context.options.onToken(token);
  const result = buildFinalResponse({ text, toolCalls: normalized.toolCalls, responseFormat: context.options.responseFormat, prompt: context.options.prompt, payload, provider: context.configuration.provider, modelName: context.configuration.modelName });
  if (context.options.enforceSchema === false) return result;
  if (result.structured) {
    Object.assign(result, validateStructuredCandidate(result.structured));
    return result;
  }
  return attachSchemaValidation(result, text);
}

async function consumeResponse(context, response) {
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Model provider returned HTTP ${response.status}.${detail ? ` ${detail.slice(0, 500)}` : ''}`);
  }
  const contentType = response.headers?.get?.('content-type') || '';
  const streamIdleTimeout = Math.max(30000, Number(context.options.timeoutMs) || 30000);
  if (context.nativeOllama && context.options.stream) return consumeOllamaStream(context, response, streamIdleTimeout);
  if (isStreamable(context, contentType)) return consumeTextStream(context, response, streamIdleTimeout);
  return consumeJsonResponse(context, response);
}

async function performRequest(options, controller) {
  const configuration = modelConfiguration(options.model, options.endpoint);
  const endpoint = options.endpoint || configuration.endpoint;
  const localOnly = LOCAL_PROVIDERS.includes(configuration.provider);
  validateProviderEndpoint(endpoint, { localOnly });
  assertSafeProviderEndpoint(endpoint);
  await validateProviderEndpointAsync(endpoint, { localOnly });
  const apiKey = resolveProviderApiKey(configuration.provider);
  assertModelConfigured(configuration, apiKey);
  const nativeOllama = configuration.provider === 'ollama' && /\/api\/chat\/?$/i.test(endpoint);
  const outputLimit = Number.isFinite(Number(options.maxTokens)) && Number(options.maxTokens) > 0 ? Math.floor(Number(options.maxTokens)) : null;
  const body = buildRequestBody({ provider: configuration.provider, modelName: configuration.modelName, prompt: options.prompt, outputLimit, seed: options.seed, stream: options.stream, nativeOllama, responseFormat: options.responseFormat, computerUse: options.computerUse, displayWidth: options.displayWidth, displayHeight: options.displayHeight });
  const headers = buildHeaders(configuration.provider, apiKey, options.computerUse);
  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
  return consumeResponse({ options, configuration, nativeOllama }, response);
}

async function generateDirect(options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  try {
    return await performRequest(options, controller);
  } catch (error) {
    controller.abort();
    if (error.name === 'AbortError') throw new Error(`Model timeout after ${options.timeoutMs}ms.`);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

async function generate({ model, prompt = '', onToken = () => {}, timeoutMs = 30000, maxTokens, endpoint, priority = 'bulk', agentId, organizationId, projectId, seed, stream = true, signal, displayWidth = 1920, displayHeight = 1080, responseFormat, enforceSchema = true }) {
  const effectiveTimeout = Number.isFinite(Number(timeoutMs)) ? Math.max(1, Math.min(Number(timeoutMs), 30 * 60 * 1000)) : 30000;
  const configuration = modelConfiguration(model, endpoint);
  const isOpenAiCompatible = ['openai', 'ollama', 'lmstudio', 'vllm', 'openai-compatible', 'groq', 'deepseek', 'together', 'openrouter', 'mistral'].includes(configuration.provider);
  const effectiveFormat = responseFormat || (enforceSchema && isOpenAiCompatible ? 'json_object' : undefined);
  const options = { model, prompt, onToken, timeoutMs: effectiveTimeout, maxTokens, endpoint, seed, stream, signal, displayWidth, displayHeight, responseFormat: effectiveFormat, enforceSchema };
  const targetEndpoint = endpoint || configuration.endpoint;
  if (inferenceGateway.isLocalProvider(configuration.provider, targetEndpoint)) {
    return inferenceGateway.schedule(() => generateDirect(options), { provider: configuration.provider, priority, agentId, organizationId, projectId });
  }
  return generateDirect(options);
}

function getModelStatus(model) {
  try {
    const configuration = modelConfiguration(model);
    return { ...configuration, apiKeyConfigured: configuration.configured && (LOCAL_OR_COMPATIBLE.includes(configuration.provider) || Boolean(configuration.keySource)) };
  } catch (error) { return { configured: false, apiKeyConfigured: false, error: error.message }; }
}

module.exports = { generate, tokenize, estimateTokenCount, normalizeMessageContent, configuredModel, modelConfiguration, getModelStatus, assertSafeProviderEndpoint, isSupportedProvider };
