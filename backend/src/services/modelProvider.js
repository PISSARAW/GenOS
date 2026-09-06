const inferenceGateway = require('./inferenceGatewayService');
const fs = require('fs');
const path = require('path');

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
    process.env.GENOS_DEFAULT_MODEL = `${process.env.LLM_PROVIDER}://${process.env.OLLAMA_MODEL}`;
  }
  if (!process.env.GENOS_OLLAMA_ENDPOINT && process.env.OLLAMA_API_URL) {
    process.env.GENOS_OLLAMA_ENDPOINT = `${process.env.OLLAMA_API_URL.replace(/\/$/, '')}/v1/chat/completions`;
  }
}

loadEnvironmentFile();
applyLegacyModelConfiguration();

function tokenize(text = '') { return String(text).trim().split(/\s+/).filter(Boolean); }

function configuredModel(model) {
  const value = String(model || process.env.GENOS_DEFAULT_MODEL || '').trim();
  if (!value) throw new Error('No model provider is configured. Set GENOS_DEFAULT_MODEL or LLM_PROVIDER plus its model variable.');
  if (!/^(openai|anthropic|gemini|mistral|ollama|lmstudio|vllm|openai-compatible):\/\//.test(value)) throw new Error(`Unsupported model URI '${value}'. Use OpenAI, Anthropic, Gemini, Mistral, Ollama, LM Studio, vLLM, or OpenAI-compatible syntax.`);
  return value;
}

function modelConfiguration(model) {
  const uri = configuredModel(model);
  const match = uri.match(/^([\w-]+):\/\/(.+)$/);
  const provider = match[1]; const modelName = match[2];
  const local = ['ollama', 'lmstudio', 'vllm'].includes(provider);
  const apiKey = provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : provider === 'gemini' ? process.env.GEMINI_API_KEY : provider === 'mistral' ? process.env.MISTRAL_API_KEY : (process.env.GENOS_MODEL_API_KEY || process.env.OPENAI_API_KEY);
  const endpoint = provider === 'anthropic' ? (process.env.ANTHROPIC_API_ENDPOINT || 'https://api.anthropic.com/v1/messages')
    : provider === 'gemini' ? (process.env.GEMINI_API_ENDPOINT || `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`)
      : provider === 'mistral' ? (process.env.MISTRAL_API_ENDPOINT || 'https://api.mistral.ai/v1/chat/completions')
        : provider === 'ollama' ? (process.env.GENOS_OLLAMA_ENDPOINT || 'http://localhost:11434/v1/chat/completions')
          : provider === 'lmstudio' ? (process.env.GENOS_LMSTUDIO_ENDPOINT || 'http://localhost:1234/v1/chat/completions')
            : provider === 'vllm' ? (process.env.GENOS_VLLM_ENDPOINT || 'http://localhost:8000/v1/chat/completions')
              : (process.env.GENOS_MODEL_ENDPOINT || 'https://api.openai.com/v1/chat/completions');
  return { uri, provider, modelName, endpoint, configured: local || Boolean(apiKey), keySource: apiKey ? (provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : provider === 'gemini' ? 'GEMINI_API_KEY' : provider === 'mistral' ? 'MISTRAL_API_KEY' : 'GENOS_MODEL_API_KEY/OPENAI_API_KEY') : null };
}

async function generate({ model, prompt = '', onToken = () => {}, timeoutMs = 30000, maxTokens, endpoint: endpointOverride, priority = 'bulk', agentId }) {
  const effectiveTimeout = Number.isFinite(Number(timeoutMs)) ? Math.max(1, Math.min(Number(timeoutMs), 30 * 60 * 1000)) : 30000;
  const configuration = modelConfiguration(model);
  // Local inference goes through the gateway's bounded queue: concurrent
  // agents must queue for the GPU instead of stampeding it. Cloud providers
  // have their own rate limits and bypass the queue.
  if (inferenceGateway.isLocalProvider(configuration.provider) && configuration.provider !== 'openai-compatible') {
    return inferenceGateway.schedule(
      () => generateDirect({ model, prompt, onToken, timeoutMs: effectiveTimeout, maxTokens, endpoint: endpointOverride, agentId }),
      { provider: configuration.provider, priority, agentId }
    );
  }
  return generateDirect({ model, prompt, onToken, timeoutMs: effectiveTimeout, maxTokens, endpoint: endpointOverride, agentId });
}

async function generateDirect({ model, prompt = '', onToken = () => {}, timeoutMs = 30000, maxTokens, endpoint: endpointOverride }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const configuration = modelConfiguration(model);
    const { uri: resolvedModel, provider, modelName, endpoint: configuredEndpoint, configured: isConfigured } = configuration;
    const endpoint = endpointOverride || configuredEndpoint;
    const apiKey = provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : provider === 'gemini' ? process.env.GEMINI_API_KEY : provider === 'mistral' ? process.env.MISTRAL_API_KEY : (process.env.GENOS_MODEL_API_KEY || process.env.OPENAI_API_KEY);
    if (!isConfigured || (!apiKey && !['ollama', 'lmstudio', 'vllm'].includes(provider))) throw new Error(`No API key configured for model ${resolvedModel}.`);
    const endpointWithKey = provider === 'gemini' && !endpoint.includes('key=') ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}` : endpoint;
    const headers = provider === 'anthropic' ? { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } : { 'Content-Type': 'application/json', ...(provider === 'gemini' ? {} : (apiKey ? { Authorization: `Bearer ${apiKey}` } : {})) };
    const outputLimit = Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0 ? Math.floor(Number(maxTokens)) : null;
    const body = provider === 'anthropic'
      ? { model: modelName, max_tokens: outputLimit || 2048, messages: [{ role: 'user', content: prompt }] }
      : provider === 'gemini'
        ? { contents: [{ parts: [{ text: prompt }] }], ...(outputLimit ? { generationConfig: { maxOutputTokens: outputLimit } } : {}) }
        : { model: modelName, messages: [{ role: 'user', content: prompt }], stream: false, ...(outputLimit ? { max_tokens: outputLimit } : {}) };
    const response = await fetch(endpointWithKey, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) throw new Error(`Model provider returned HTTP ${response.status}.`);
    const payload = await response.json(); const text = provider === 'anthropic' ? (payload.content?.map((part) => part.text || '').join('') || '') : provider === 'gemini' ? (payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '') : (payload.choices?.[0]?.message?.content || '');
    for (const token of tokenize(text)) await onToken(token);
    return { text, inputTokens: payload.usage?.input_tokens || payload.usage?.prompt_tokens || tokenize(prompt).length, outputTokens: payload.usage?.output_tokens || payload.usage?.completion_tokens || tokenize(text).length, provider };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Model timeout after ${timeoutMs}ms.`);
    throw error;
  } finally { clearTimeout(timer); }
}

function getModelStatus(model) {
  try {
    const configuration = modelConfiguration(model);
    return { ...configuration, apiKeyConfigured: configuration.configured && (['ollama', 'lmstudio', 'vllm'].includes(configuration.provider) || Boolean(configuration.keySource)) };
  } catch (error) { return { configured: false, apiKeyConfigured: false, error: error.message }; }
}

module.exports = { generate, tokenize, configuredModel, modelConfiguration, getModelStatus };
