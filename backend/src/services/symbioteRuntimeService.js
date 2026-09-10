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

async function requestLocalEmbedding(base, model, text) {
  const response = await fetch(`${base}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text }),
    signal: AbortSignal.timeout(4000)
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const vectors = payload.embeddings || [];
  return vectors.length ? vectors[0] : null;
}

async function embedLocally(text) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return null;
  const base = localEmbeddingBase();
  validateProviderEndpoint(base, { localOnly: true });
  try {
    return await requestLocalEmbedding(base, localEmbeddingModel(), cleanText);
  } catch (_) {
    return null;
  }
}

/** Symbiotes embed locally in milliseconds; the Host never takes this path. */
async function embedForSymbiote(role, text) {
  if (!isSymbioteRole(role)) return { engine: 'cloud', embedding: null };
  const startedAt = Date.now();
  const embedding = await embedLocally(text);
  return { engine: 'local', embedding, latencyMs: Date.now() - startedAt };
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

