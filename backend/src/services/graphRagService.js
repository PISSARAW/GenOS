/**
 * GenOS Cognitive Memory - GraphRAG & Spreading Activation Service
 * Recursive SQLite CTE traversal, Hippocampal Time Cells, and Vector Spreading Activation
 */

const { cosineSimilarity, textToVector } = require('./memoryScoring');
const MAX_GRAPH_QUERY_BYTES = 20 * 1024;
const MAX_GRAPH_DOCUMENT_BYTES = 5 * 1024 * 1024;
const MAX_GRAPH_QUERY_LIMIT = 50;

function decodeEmbeddingBlob(blob) {
  if (!blob) return [];
  try {
    if (Buffer.isBuffer(blob)) {
      const float32 = new Float32Array(blob.buffer, blob.byteOffset, Math.floor(blob.byteLength / 4));
      return Array.from(float32);
    }
  } catch (_) {}
  return [];
}

function ragScope(options = {}) {
  const organizationId = String(options.organizationId || '').trim();
  const projectId = String(options.projectId || '').trim();
  if (Boolean(organizationId) !== Boolean(projectId)) throw new Error('Organization and project scope must be provided together.');
  if (!organizationId && !options.allowGlobal) throw new Error('An authorized tenant scope is required for GraphRAG.');
  return { organizationId: organizationId || null, projectId: projectId || null };
}

/**
 * Traverses memory_synapses graph up to 2 hops using SQLite recursive CTE
 * @param {string[]} topIds
 * @param {object} db
 * @returns {Promise<object[]>}
 */
function globalAllowed(options = {}) {
  return options.includeGlobal === true || options.allowGlobal === true;
}

function scopeFilter(alias, column, ctx) {
  if (!ctx.value) return '';
  const ref = alias ? `${alias}.${column}` : column;
  if (ctx.global) return ` AND (${ref} = ? OR ${ref} IS NULL)`;
  return ` AND ${ref} = ?`;
}

function buildTraversalQuery(topIds, options) {
  const tenant = options.tenant || options;
  const ownerClause = options.ownerId ? ' AND gd.created_by = ?' : '';
  const global = globalAllowed({ ...tenant, ...options });
  const nodeScope = scopeFilter('gd', 'organization_id', { value: tenant.organizationId, global });
  const orgScope = scopeFilter('ms', 'organization_id', { value: tenant.organizationId, global });
  const projectScope = scopeFilter('ms', 'project_id', { value: tenant.projectId, global });
  const params = [...topIds];
  if (options.ownerId) params.push(options.ownerId);
  if (tenant.organizationId) params.push(tenant.organizationId, tenant.organizationId);
  if (tenant.projectId) params.push(tenant.projectId);
  return {
    params,
    sql: `
      WITH RECURSIVE
        traverse(id, depth, weight) AS (
          SELECT id, 0, 1.0 FROM genome_decisions gd WHERE id IN (${topIds.map(() => '?').join(',')})${ownerClause}${nodeScope}
          UNION
          SELECT
            CASE WHEN ms.source_id = t.id THEN ms.target_id ELSE ms.source_id END,
            t.depth + 1,
            t.weight * (MIN(2.0, ms.weight) / 2.0)
          FROM traverse t
          JOIN memory_synapses ms ON (ms.source_id = t.id OR ms.target_id = t.id)${orgScope}${projectScope}
          WHERE t.depth < 2 AND ms.weight > 0 AND (ms.transmitter_type IS NULL OR ms.transmitter_type != 'gaba')
        )
      SELECT id, depth, weight FROM traverse WHERE depth > 0 ORDER BY weight DESC, depth ASC LIMIT 15`
  };
}

function collectEdgeWeights(synapses, topIds) {
  const weights = new Map();
  for (const edge of synapses) {
    if (topIds.includes(edge.id)) continue;
    if (!weights.has(edge.id) || edge.weight > weights.get(edge.id)) weights.set(edge.id, edge.weight);
  }
  return weights;
}

async function fetchConnectedDecisions(ids, db, options) {
  const tenant = options.tenant || options;
  const ownerId = options.ownerId || '';
  const global = globalAllowed({ ...tenant, ...options });
  const org = { value: tenant.organizationId, global };
  const proj = { value: tenant.projectId, global };
  const clauses = [ownerId ? ' AND created_by = ?' : '', scopeFilter('', 'organization_id', org), scopeFilter('', 'project_id', proj)];
  const params = [...ids, ...(ownerId ? [ownerId] : []), ...(tenant.organizationId ? [tenant.organizationId] : []), ...(tenant.projectId ? [tenant.projectId] : [])];
  return db.all(`SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob FROM genome_decisions WHERE id IN (${ids.map(() => '?').join(',')})${clauses.join('')}`, ...params);
}

function mapConnectedDecision(item, weights) {
  const edgeWeight = weights.get(item.id) ?? 1.0;
  const score = Number(((item.synaptic_weight || 1.0) * 0.4 * Math.min(2.5, Math.max(0.1, edgeWeight))).toFixed(4));
  return { id: item.id, title: item.title, category: item.category, status: item.category === 'Failure' ? 'FAILURE' : 'SUCCESS', summary: item.content, tags: ['genome', item.category, 'graph_association'], author: item.created_by, createdAt: item.created_at, vector: decodeEmbeddingBlob(item.embedding_blob), synaptic_weight: item.synaptic_weight || 1.0, similarityScore: score, cosineMetric: 0.5, synaptic_edge_weight: Number(edgeWeight.toFixed(4)) };
}

async function traverseSynapses(topIds = [], db = null, options = {}) {
  if (!db || !topIds.length) return [];
  try {
    const plan = buildTraversalQuery(topIds, options);
    const edges = await db.all(plan.sql, ...plan.params);
    const weights = collectEdgeWeights(edges, topIds);
    if (!weights.size) return [];
    const decisions = await fetchConnectedDecisions([...weights.keys()], db, options);
    return decisions.map((item) => mapConnectedDecision(item, weights));
  } catch {
    return [];
  }
}

/**
 * Fetches chronologically adjacent episodic memories (Time Cells)
 * @param {object[]} timeAnchors
 * @param {object} db
 * @returns {Promise<object[]>}
 */
async function fetchTemporalAnchors(timeAnchors = [], db = null, { ownerId = '', ...options } = {}) {
  if (!db || !timeAnchors.length) return [];
  const temporalItems = [];
  const horizonHours = Number.isFinite(options.horizonHours) ? options.horizonHours : 24;
  for (const anchor of timeAnchors) {
    if (!anchor.createdAt) continue;
    const anchorTime = new Date(anchor.createdAt).getTime();
    if (Number.isNaN(anchorTime)) continue;
    const bounds = { ...options, ownerId, minTime: new Date(anchorTime - horizonHours * 3600 * 1000).toISOString(),
      maxTime: new Date(anchorTime + horizonHours * 3600 * 1000).toISOString() };
    try {
      const prev = await temporalNeighbor(db, anchor, { ...bounds, direction: 'past' });
      if (prev) temporalItems.push(temporalMemoryRecord(prev, 'past'));
      const next = await temporalNeighbor(db, anchor, { ...bounds, direction: 'future' });
      if (next) temporalItems.push(temporalMemoryRecord(next, 'future'));
    } catch {}
  }
  return temporalItems;
}

/**
 * Expands top memory items with graph associations and temporal context
 * @param {object[]} topItems
 * @param {object} db
 * @param {object} options
 * @returns {Promise<object[]>}
 */
async function expandGraphRag(topItems = [], db = null, options = {}) {
  const connectedItems = [];
  const topIds = topItems
    .filter(i => i.category !== undefined && !String(i.id).startsWith('seed-'))
    .map(i => i.id);

  // 1. Spreading Activation through physical synapses
  if (topIds.length > 0 && db) {
    const synapticNeighbors = await traverseSynapses(topIds, db, options);
    for (const item of synapticNeighbors) {
      if (isNewMemory(item.id, topItems, connectedItems)) {
        connectedItems.push(item);
      }
    }
  }

  await expandTemporalHops({ topItems, db, options, connectedItems });
  expandVectorHops(topItems, options, connectedItems);

  return connectedItems;
}

const nerService = require('./nerService');
const { getDatabase } = require('../db');

function validateDocumentInput(docId, text) {
  if (typeof docId !== 'string' || !docId.trim() || docId.length > 256) {
    throw new Error('Document id must be a non-empty string of at most 256 characters.');
  }
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_GRAPH_DOCUMENT_BYTES) {
    throw new Error('Document text exceeds the configured size limit.');
  }
}

async function prepareDocumentRecord(docId, text, { db, ...scope }) {
  const content = String(text || '').slice(0, 1000);
  const title = `Document ${docId}`;
  const { embed } = require('./embeddingProvider');
  const vec = (await embed(content)) || textToVector(content);
  const float32 = new Float32Array(vec);
  const buffer = Buffer.from(float32.buffer);
  const existing = await db.get('SELECT organization_id, project_id FROM genome_decisions WHERE id = ?', docId);
  if (existing && (existing.organization_id !== scope.organizationId || existing.project_id !== scope.projectId)) {
    throw new Error('Document id already belongs to another memory scope.');
  }
  return { title, content, buffer };
}

async function persistDocument(db, docId, { record, scope }) {
  await db.run(
    `INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight, organization_id, project_id)
     VALUES (?, ?, ?, ?, 'graph_rag', 'document', 1.0, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content,
       embedding_blob = excluded.embedding_blob, category = excluded.category
     WHERE genome_decisions.organization_id IS excluded.organization_id
       AND genome_decisions.project_id IS excluded.project_id`,
    docId, record.title, record.content, record.buffer, scope.organizationId, scope.projectId
  );
}

/**
 * Ingests a document into the Knowledge Graph with entity extraction and synaptic wiring
 * @param {string} docId
 * @param {string} text
 * @param {object} dbInstance
 * @returns {Promise<{ docId: string, entitiesCount: number, relationsCount: number }>}
 */
async function ingestDocument(docId, text, options = {}) {
  const scope = ragScope(options);
  validateDocumentInput(docId, text);
  const db = options.dbInstance || await getDatabase();
  const { entities, relations } = await nerService.extractEntities(text);

  const record = await prepareDocumentRecord(docId, text, { ...scope, db });
  await persistDocument(db, docId, { record, scope });

  const enriched = await nerService.enrichKnowledgeGraph(db, { text, decisionId: docId, scope });

  return {
    docId,
    entitiesCount: entities.length,
    relationsCount: relations.length,
    synapsesCreated: enriched.synapsesCreated
  };
}

/**
 * Queries the Knowledge Graph using recursive traversal and entity extraction
 * @param {string} query
 * @param {number} limit
 * @param {object} dbInstance
 * @returns {Promise<{ nodes: object[], synthesis: string }>}
 */
async function findMatchingDecisions(query, db, { scope, limit }) {
  const { entities } = await nerService.extractEntities(query);
  const entityTerms = entities.slice(0, 50).map((entity) => entity.text);
  const tenantSql = scope.organizationId
    ? ' AND (organization_id = ? OR organization_id IS NULL) AND (project_id = ? OR project_id IS NULL)'
    : '';
  const tenantParams = scope.organizationId ? [scope.organizationId, scope.projectId] : [];
  if (entityTerms.length) {
    const termsSql = entityTerms.map(() => '(title LIKE ? OR content LIKE ?)').join(' OR ');
    const termParams = entityTerms.flatMap((term) => [`%${term}%`, `%${term}%`]);
    const matches = await db.all(`SELECT id, title, category, content, synaptic_weight FROM genome_decisions WHERE ${termsSql}${tenantSql} ORDER BY synaptic_weight DESC LIMIT ?`, ...termParams, ...tenantParams, limit);
    if (matches.length) return matches;
  }
  return db.all(`SELECT id, title, category, content, synaptic_weight FROM genome_decisions WHERE (title LIKE ? OR content LIKE ?)${tenantSql} ORDER BY synaptic_weight DESC LIMIT ?`, `%${query}%`, `%${query}%`, ...tenantParams, limit);
}

function boundedGraphLimit(value) {
  const limit = Number(value);
  return Number.isSafeInteger(limit) ? Math.max(1, Math.min(limit, MAX_GRAPH_QUERY_LIMIT)) : 5;
}

function graphSynthesis(query, nodes) {
  const labels = nodes.map((node) => node.title || node.label || node.id);
  return `Found ${nodes.length} graph node(s) linked to '${query}': ${labels.slice(0, 3).join(', ')}`;
}

async function queryKnowledgeGraph(query, options = {}) {
  const scope = ragScope(options);
  const db = options.dbInstance || await getDatabase();
  const q = String(query || '').trim();
  if (!q) return { nodes: [], synthesis: 'Empty query' };
  if (Buffer.byteLength(q, 'utf8') > MAX_GRAPH_QUERY_BYTES) throw new Error('GraphRAG query exceeds the configured size limit.');
  const boundedLimit = boundedGraphLimit(options.limit);
  const matchedDecisions = await findMatchingDecisions(q, db, { scope, limit: boundedLimit });
  const topIds = matchedDecisions.map(d => d.id);
  const synapticNeighbors = await traverseSynapses(topIds, db, scope);

  const allNodes = [...matchedDecisions, ...synapticNeighbors].slice(0, boundedLimit * 2);
  return { nodes: allNodes, synthesis: graphSynthesis(q, allNodes) };
}

module.exports = {
  traverseSynapses,
  fetchTemporalAnchors,
  expandGraphRag,
  queryKnowledgeGraph,
  ingestDocument
};

async function temporalNeighbor(db, anchor, options) {
  const past = options.direction === 'past';
  let query = 'SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob FROM genome_decisions WHERE '
    + (past ? 'created_at < ? AND created_at >= ?' : 'created_at > ? AND created_at <= ?') + ' AND id != ?';
  const params = [anchor.createdAt, past ? options.minTime : options.maxTime, anchor.id];
  for (const [key, column] of [['ownerId', 'created_by'], ['organizationId', 'organization_id'], ['projectId', 'project_id']]) {
    if (options[key]) { query += ' AND ' + column + ' = ?'; params.push(options[key]); }
  }
  query += past ? ' ORDER BY created_at DESC LIMIT 1' : ' ORDER BY created_at ASC LIMIT 1';
  return db.get(query, ...params);
}

function temporalMemoryRecord(row, direction) {
  return { id: row.id, title: row.title, category: row.category,
    status: row.category === 'Failure' ? 'FAILURE' : 'SUCCESS', summary: row.content,
    tags: ['genome', 'temporal_context_' + direction], author: row.created_by, createdAt: row.created_at,
    vector: decodeEmbeddingBlob(row.embedding_blob), synaptic_weight: row.synaptic_weight || 1.0,
    similarityScore: Number(((row.synaptic_weight || 1.0) * 0.35).toFixed(4)), cosineMetric: 0.45 };
}

function expandVectorHops(topItems, options, connectedItems) {
  // 3. Dynamic Vector Multi-Hop Fallback
  if (topItems.length > 0 && options.hormone !== 'adrenaline' && Array.isArray(options.corpus)) {
    const bestMemVec = topItems[0].vector;
    if (bestMemVec && bestMemVec.length > 0) {
      const neighbors = options.corpus
        .filter(item => item.id !== topItems[0].id && item.vector && item.vector.length > 0)
        .map(item => ({ item, sim: cosineSimilarity(bestMemVec, item.vector) }))
        .filter(x => x.sim > 0.55)
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 4);

      for (const n of neighbors) {
        if (isNewMemory(n.item.id, topItems, connectedItems)) {
          connectedItems.push(vectorHopRecord(n));
        }
      }
    }
  }
}

function isNewMemory(id, topItems, connectedItems) {
  return !topItems.find(t => t.id === id) && !connectedItems.find(c => c.id === id);
}

function vectorHopRecord(n) {
  return {
            id: n.item.id,
            title: n.item.title,
            category: n.item.category,
            status: 'SUCCESS',
            summary: n.item.summary,
            tags: [...(n.item.tags || []), 'vector_hop'],
            author: n.item.author,
            createdAt: n.item.createdAt,
            vector: n.item.vector || [],
            synaptic_weight: n.item.synaptic_weight || 1.0,
            similarityScore: Number((n.sim * 0.5).toFixed(4)),
            cosineMetric: n.sim
  };
}

async function expandTemporalHops({ topItems, db, options, connectedItems }) {
  // 2. Temporal Reasoning (Time Cells)
  if (topItems.length > 0 && db) {
    const timeAnchors = topItems.slice(0, 2);
    const timeNeighbors = await fetchTemporalAnchors(timeAnchors, db, { ...options, ownerId: options.ownerId || '' });
    for (const item of timeNeighbors) {
      if (!topItems.find(t => t.id === item.id) && !connectedItems.find(c => c.id === item.id)) {
        connectedItems.push(item);
      }
    }
  }
}
