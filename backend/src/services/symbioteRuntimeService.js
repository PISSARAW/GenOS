/**
 * SymbioteRuntime: asymmetric Holobionte inference routing.
 *
 * The Host Orchestrator stays on a heavy cloud model (frontier tier): it owns
 * authority and complex reasoning. Symbiotes (Specialist, Immune, Memory) run
 * their fast, high-frequency tasks — embeddings and JSON schema validation —
 * on a local inference runtime (Ollama, or MLX via its OpenAI-compatible
 * server) so they never pay network latency or per-token API cost before
 * feeding the Host.
 */
const { validateProviderEndpoint } = require('./providerEndpointPolicy');
const specValidator = require('./specValidator');
const modelRouter = require('./modelRouter');
const localModelDiscovery = require('./localModelDiscovery');

const HOST_ROLE = 'host_orchestrator';
const SYMBIONT_ROLES = new Set(['specialist_symbiont', 'immune_symbiont', 'memory_symbiont']);
const DEFAULT_LOCAL_EMBEDDING_URL = 'http://127.0.0.1:11434';
const DEFAULT_LOCAL_EMBEDDING_MODEL = 'nomic-embed-text';

function isHostRole(role) {
  return String(role || '').trim() === HOST_ROLE;
}

function isSymbioteRole(role) {
  return SYMBIONT_ROLES.has(String(role || '').trim());
}

/** cloud for the Host, local for every Symbiote; cloud for anything else. */
function engineFor(role) {
  return isSymbioteRole(role) ? 'local' : 'cloud';
}

/** Local-only embedding call: never falls back to a cloud provider or its cost. */
function localEmbeddingBase() {
  const configured = process.env.GENOS_EMBEDDING_URL || process.env.GENOS_OLLAMA_URL || process.env.OLLAMA_HOST;
  return String(configured || DEFAULT_LOCAL_EMBEDDING_URL).replace(/\/+$/, '');
}

function localEmbeddingModel() {
  return process.env.GENOS_EMBEDDING_MODEL || process.env.OLLAMA_EMBEDDING_MODEL || DEFAULT_LOCAL_EMBEDDING_MODEL;
}

// Ollama changed its embedding API: recent versions expose POST /api/embed
// with { model, input } returning { embeddings: [[...]] }, while older builds
// expose POST /api/embeddings with { model, prompt } returning { embedding }.
// Try the modern shape first and fall back only on 404.
async function requestLocalEmbedding(base, model, text) {
  const signal = AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined;
  const modern = await fetch(`${base}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text }),
    redirect: 'manual',
    signal
  });
  if (modern.ok) {
    const payload = await modern.json();
    const vectors = Array.isArray(payload.embeddings) ? payload.embeddings : [];
    return vectors.length ? vectors[0] : null;
  }
  if (modern.status !== 404) {
    throw new Error(`Local embedding endpoint returned HTTP ${modern.status}`);
  }
  const legacy = await fetch(`${base}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
    redirect: 'manual',
    signal
  });
  if (!legacy.ok) {
    throw new Error(`Legacy local embedding endpoint returned HTTP ${legacy.status}`);
  }
  const legacyPayload = await legacy.json();
  const vector = legacyPayload.embedding;
  return Array.isArray(vector) && vector.length ? vector : null;
}

function classifyEmbeddingError(error) {
  const message = error?.message || '';
  if (error?.name === 'TimeoutError' || /timeout|aborted/i.test(message)) return 'LOCAL_EMBEDDING_TIMEOUT';
  if (/loopback|Local provider|valid absolute URL|HTTP or HTTPS|credentials/i.test(message)) return 'INVALID_EMBEDDING_ENDPOINT';
  if (/HTTP \d+/i.test(message)) return 'LOCAL_EMBEDDING_HTTP_ERROR';
  return 'LOCAL_RUNTIME_UNAVAILABLE';
}

// Never throws: returns a structured result so callers can tell an embedding
// failure (Ollama down / invalid endpoint) apart from an empty input.
async function embedLocally(text) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return { embedding: null, skipped: true, errorCode: 'EMPTY_TEXT' };
  try {
    const base = localEmbeddingBase();
    validateProviderEndpoint(base, { localOnly: true });
    const embedding = await requestLocalEmbedding(base, localEmbeddingModel(), cleanText);
    return { embedding, skipped: false };
  } catch (error) {
    return { embedding: null, skipped: false, error: error.message, errorCode: classifyEmbeddingError(error) };
  }
}

// Thundering-herd guard: identical in-flight embeddings share one promise and
// successful results are reused briefly.
const inflightEmbeddings = new Map();
const embeddingCache = new Map();
const EMBEDDING_CACHE_TTL_MS = 30000;

function embeddingKey(text) {
  return `${localEmbeddingModel()}\u0000${text}`;
}

async function embedLocallyCached(text) {
  const key = embeddingKey(text);
  const cached = embeddingCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = inflightEmbeddings.get(key);
  if (pending) return pending;
  const task = embedLocally(text).then((value) => {
    embeddingCache.set(key, { expiresAt: Date.now() + EMBEDDING_CACHE_TTL_MS, value });
    if (embeddingCache.size > 1000) embeddingCache.delete(embeddingCache.keys().next().value);
    return value;
  }).finally(() => inflightEmbeddings.delete(key));
  inflightEmbeddings.set(key, task);
  return task;
}

/** Symbiotes embed locally in milliseconds; the Host never takes this path. */
async function embedForSymbiote(role, text) {
  if (!isSymbioteRole(role)) return { engine: 'cloud', embedding: null };
  const startedAt = Date.now();
  const result = await embedLocallyCached(text);
  return {
    engine: 'local',
    embedding: result.embedding,
    latencyMs: Date.now() - startedAt,
    skipped: result.skipped,
    ...(result.error ? { error: result.error } : {}),
    ...(result.errorCode ? { errorCode: result.errorCode } : {})
  };
}

/** In-process JSON Schema validation: no network hop for either engine. */
function validateSchemaLocally(value, schema) {
  const startedAt = Date.now();
  const result = specValidator.validateWithSchema(value, schema);
  return { engine: 'local', latencyMs: Date.now() - startedAt, ...result };
}

/** Local chat-model routing policy (Ollama/MLX) for a Symbiote's own calls. */
async function localRouteFor(db, context = {}) {
  if (!isSymbioteRole(context.role)) return null;
  const models = await localModelDiscovery.discoverLocalModels();
  const localUris = models.filter((model) => model.chatCapable).map((model) => model.uri);
  return modelRouter.localRoutingPolicy(db, { agentId: context.agentId }, localUris);
}

module.exports = {
  isHostRole,
  isSymbioteRole,
  engineFor,
  embedForSymbiote,
  validateSchemaLocally,
  localRouteFor
};

