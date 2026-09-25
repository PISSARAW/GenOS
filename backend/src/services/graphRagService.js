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
function buildTraversalQuery(topIds, options) {
  const tenant = options.tenant || options;
  const ownerClause = options.ownerId ? ' AND gd.created_by = ?' : '';
  const nodeScope = tenant.organizationId ? ' AND (gd.organization_id = ? OR gd.organization_id IS NULL)' : '';
  const orgScope = tenant.organizationId ? ' AND (ms.organization_id = ? OR ms.organization_id IS NULL)' : '';
  const projectScope = tenant.projectId ? ' AND (ms.project_id = ? OR ms.project_id IS NULL)' : '';
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
  const clauses = [ownerId ? ' AND created_by = ?' : '', tenant.organizationId ? ' AND (organization_id = ? OR organization_id IS NULL)' : '', tenant.projectId ? ' AND (project_id = ? OR project_id IS NULL)' : ''];
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
async function fetchTemporalAnchors(timeAnchors = [], db = null, ownerId = '', options = {}) {
  if (!db || !timeAnchors.length) return [];
  const temporalItems = [];
  const horizonHours = Number.isFinite(options.horizonHours) ? options.horizonHours : 24;
  const horizonMs = horizonHours * 3600 * 1000;

  for (const anchor of timeAnchors) {
    if (!anchor.createdAt) continue;
    const anchorTime = new Date(anchor.createdAt).getTime();
    if (Number.isNaN(anchorTime)) continue;

    const minTime = new Date(anchorTime - horizonMs).toISOString();
    const maxTime = new Date(anchorTime + horizonMs).toISOString();

    try {
      let pastQuery = 'SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob FROM genome_decisions WHERE created_at < ? AND created_at >= ? AND id != ?';
      const pastParams = [anchor.createdAt, minTime, anchor.id];
      if (ownerId) {
        pastQuery += ' AND created_by = ?';
        pastParams.push(ownerId);
      }
      if (options.organizationId) {
        pastQuery += ' AND organization_id = ?';
        pastParams.push(options.organizationId);
      }
      if (options.projectId) {
        pastQuery += ' AND project_id = ?';
        pastParams.push(options.projectId);
      }
      pastQuery += ' ORDER BY created_at DESC LIMIT 1';

      const prev = await db.get(pastQuery, ...pastParams);
      if (prev) {
        temporalItems.push({
          id: prev.id,
          title: prev.title,
          category: prev.category,
          status: prev.category === 'Failure' ? 'FAILURE' : 'SUCCESS',
          summary: prev.content,
          tags: ['genome', 'temporal_context_past'],
          author: prev.created_by,
          createdAt: prev.created_at,
          vector: decodeEmbeddingBlob(prev.embedding_blob),
          synaptic_weight: prev.synaptic_weight || 1.0,
          similarityScore: Number(((prev.synaptic_weight || 1.0) * 0.35).toFixed(4)),
          cosineMetric: 0.45
        });
      }

      let nextQuery = 'SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob FROM genome_decisions WHERE created_at > ? AND created_at <= ? AND id != ?';
      const nextParams = [anchor.createdAt, maxTime, anchor.id];
      if (ownerId) {
        nextQuery += ' AND created_by = ?';
        nextParams.push(ownerId);
      }
      if (options.organizationId) {
        nextQuery += ' AND organization_id = ?';
        nextParams.push(options.organizationId);
      }
      if (options.projectId) {
        nextQuery += ' AND project_id = ?';
        nextParams.push(options.projectId);
      }
      nextQuery += ' ORDER BY created_at ASC LIMIT 1';

      const next = await db.get(nextQuery, ...nextParams);
      if (next) {
        temporalItems.push({
          id: next.id,
          title: next.title,
          category: next.category,
          status: next.category === 'Failure' ? 'FAILURE' : 'SUCCESS',
          summary: next.content,
          tags: ['genome', 'temporal_context_future'],
          author: next.created_by,
          createdAt: next.created_at,
          vector: decodeEmbeddingBlob(next.embedding_blob),
          synaptic_weight: next.synaptic_weight || 1.0,
          similarityScore: Number(((next.synaptic_weight || 1.0) * 0.35).toFixed(4)),
          cosineMetric: 0.45
        });
      }
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
      if (!topItems.find(t => t.id === item.id) && !connectedItems.find(c => c.id === item.id)) {
        connectedItems.push(item);
      }
    }
  }

  // 2. Temporal Reasoning (Time Cells)
  if (topItems.length > 0 && db) {
    const timeAnchors = topItems.slice(0, 2);
    const timeNeighbors = await fetchTemporalAnchors(timeAnchors, db, options.ownerId || '', options);
    for (const item of timeNeighbors) {
      if (!topItems.find(t => t.id === item.id) && !connectedItems.find(c => c.id === item.id)) {
        connectedItems.push(item);
      }
    }
  }

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
        if (!topItems.find(t => t.id === n.item.id) && !connectedItems.find(c => c.id === n.item.id)) {
          connectedItems.push({
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
          });
        }
      }
    }
  }

  return connectedItems;
}

const nerService = require('./nerService');
const { getDatabase } = require('../db');

/**
 * Ingests a document into the Knowledge Graph with entity extraction and synaptic wiring
 * @param {string} docId
 * @param {string} text
 * @param {object} dbInstance
 * @returns {Promise<{ docId: string, entitiesCount: number, relationsCount: number }>}
 */
async function ingestDocument(docId, text, options = {}) {
  const scope = ragScope(options);
  if (typeof docId !== 'string' || !docId.trim() || docId.length > 256) throw new Error('Document id must be a non-empty string of at most 256 characters.');
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_GRAPH_DOCUMENT_BYTES) throw new Error('Document text exceeds the configured size limit.');
  const db = options.dbInstance || await getDatabase();
  const { entities, relations } = await nerService.extractEntities(text);

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
  await db.run(
    `INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight, organization_id, project_id)
     VALUES (?, ?, ?, ?, 'graph_rag', 'document', 1.0, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content,
       embedding_blob = excluded.embedding_blob, category = excluded.category
     WHERE genome_decisions.organization_id IS excluded.organization_id
       AND genome_decisions.project_id IS excluded.project_id`,
    docId, title, content, buffer, scope.organizationId, scope.projectId
  );

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
async function findMatchingDecisions(query, db, scope, limit) {
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
  const matchedDecisions = await findMatchingDecisions(q, db, scope, boundedLimit);
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
