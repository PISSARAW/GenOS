/**
 * GenOS NER & Knowledge Graph Extraction Service
 * Client for Python GLiNER FastAPI microservice with resilient heuristic fallback.
 */

const KNOWN_TECH = [
  'SQLite', 'Node', 'Node.js', 'Rust', 'Python', 'React', 'Vue', 'Docker',
  'Kubernetes', 'gRPC', 'Protobuf', 'FastAPI', 'GLiNER', 'Codex', 'GenOS',
  'FTS5', 'vec0', 'STDP', 'GraphRAG', 'Express', 'JavaScript', 'TypeScript'
];

const KNOWN_ORGS = ['GenOS', 'Google', 'DeepMind', 'Anthropic', 'OpenAI', 'GitHub'];

function getNerUrl() {
  if (process.env.GENOS_NER_URL) return process.env.GENOS_NER_URL;
  const host = process.env.GENOS_NER_HOST || '127.0.0.1';
  const port = process.env.GENOS_NER_PORT || '8000';
  return `http://${host}:${port}`;
}

/**
 * Checks availability of the Python GLiNER microservice
 * @returns {Promise<{ available: boolean, status: string, service?: string }>}
 */
async function checkHealth(timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${getNerUrl()}/health`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { available: false, status: `HTTP_${res.status}` };
    const data = await res.json();
    return { available: true, status: 'ok', service: data.service || 'gliner_ner', labels: data.labels || [] };
  } catch (err) {
    return { available: false, status: 'offline', error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

function escapeRegExp(string) {
  return String(string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractOrgs(content, lower) {
  const orgs = [];
  for (const org of KNOWN_ORGS) {
    if (content.includes(org) || lower.includes(org.toLowerCase())) {
      orgs.push({ text: org, label: 'Organization' });
    }
  }
  return orgs;
}

function extractTech(content) {
  const techList = [];
  for (const tech of KNOWN_TECH) {
    const regex = new RegExp(`\\b${escapeRegExp(tech)}\\b`, 'i');
    if (regex.test(content)) {
      techList.push({ text: tech, label: 'Technology' });
    }
  }
  return techList;
}

function extractFilePaths(content) {
  if (typeof content !== 'string') return [];
  const safeContent = content.slice(0, 10000);
  const tokens = safeContent.split(/[\s"'`<>]+/);
  const pathMatches = [];
  const extRegex = /\.(?:js|cjs|rs|py|json|db|proto|md)$/i;
  for (const token of tokens) {
    if (token.length <= 256 && extRegex.test(token) && /^[a-zA-Z0-9_./-]+$/.test(token)) {
      pathMatches.push(token);
    }
  }
  return pathMatches.slice(0, 4).map((p) => ({ text: p, label: 'Location' }));
}

function buildRelations(entities, action) {
  const relations = [];
  if (entities.length < 2) return relations;
  for (let i = 0; i < entities.length - 1; i++) {
    relations.push({
      entity_a: entities[i].text,
      type_a: entities[i].label,
      relation: action,
      entity_b: entities[i + 1].text,
      type_b: entities[i + 1].label
    });
  }
  return relations;
}

/**
 * Heuristic fallback extraction when Python microservice is offline
 * @param {string} text
 * @returns {{ relations: object[], entities: object[], source: string }}
 */
function heuristicExtract(text = '') {
  const content = String(text || '');
  const lower = content.toLowerCase();
  const orgEntities = extractOrgs(content, lower);
  const techEntities = extractTech(content);
  const pathEntities = extractFilePaths(content);
  const entities = [...orgEntities, ...techEntities, ...pathEntities];

  const actionMatch = content.match(/\b(build|compile|test|deploy|mutate|rollback|index|search|extract|repair)\b/i);
  const action = actionMatch ? actionMatch[1].toUpperCase() : 'RELATED_TO';
  const relations = buildRelations(entities, action);

  return { entities, relations, source: 'heuristic_fallback' };
}

/**
 * Extracts entities and relations via GLiNER microservice, with fallback
 * @param {string} text
 * @param {object} options
 * @returns {Promise<{ relations: object[], entities: object[], source: string }>}
 */
async function extractEntities(text, options = {}) {
  const timeoutMs = options.timeoutMs || 3000;
  if (!text || typeof text !== 'string') {
    return { relations: [], entities: [], source: 'empty_input' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${getNerUrl()}/extract`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });

    if (!res.ok) {
      return heuristicExtract(text);
    }

    const data = await res.json();
    const relations = Array.isArray(data.relations) ? data.relations : [];
    const entities = Array.isArray(data.entities) ? data.entities : [];
    return { relations, entities, source: 'gliner_service' };
  } catch {
    return heuristicExtract(text);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Enriches memory graph synapses based on extracted entities
 * @param {object} db
 * @param {string} text
 * @param {string} decisionId
 * @returns {Promise<{ extractedCount: number, synapsesCreated: number }>}
 */
async function enrichKnowledgeGraph(db, text, decisionId) {
  if (!db || !text || !decisionId) {
    return { extractedCount: 0, synapsesCreated: 0 };
  }

  try {
    const { relations } = await extractEntities(text);
    if (!relations.length) return { extractedCount: 0, synapsesCreated: 0 };

    let created = 0;
    for (const rel of relations) {
      // Look for any existing decision whose title or content mentions entity_b
      const target = await db.get(
        `SELECT id FROM genome_decisions WHERE (title LIKE ? OR content LIKE ?) AND id != ? LIMIT 1`,
        `%${rel.entity_b}%`, `%${rel.entity_b}%`, decisionId
      );

      if (target) {
        await db.run(
          `INSERT OR IGNORE INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, 1.2)`,
          decisionId, target.id
        );
        created++;
      }
    }

    return { extractedCount: relations.length, synapsesCreated: created };
  } catch {
    return { extractedCount: 0, synapsesCreated: 0 };
  }
}

module.exports = {
  checkHealth,
  extractEntities,
  heuristicExtract,
  enrichKnowledgeGraph,
  getNerUrl
};
