/**
 * GenOS Cognitive Memory - GraphRAG & Spreading Activation Service
 * Recursive SQLite CTE traversal, Hippocampal Time Cells, and Vector Spreading Activation
 */

const { cosineSimilarity } = require('./memoryScoring');

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

/**
 * Traverses memory_synapses graph up to 2 hops using SQLite recursive CTE
 * @param {string[]} topIds
 * @param {object} db
 * @returns {Promise<object[]>}
 */
async function traverseSynapses(topIds = [], db = null, ownerId = '', tenant = {}) {
  if (!db || !topIds.length) return [];

  const placeholders = topIds.map(() => '?').join(',');
  try {
    const ownerClause = ownerId ? ' AND gd.created_by = ?' : '';
    const orgClause = tenant.organizationId ? ' AND (gd.organization_id = ? OR gd.organization_id IS NULL)' : '';
    const synapseOrgClause = tenant.organizationId ? ' AND (ms.organization_id = ? OR ms.organization_id IS NULL)' : '';
    const queryParams = [...topIds];
    if (ownerId) queryParams.push(ownerId);
    if (tenant.organizationId) queryParams.push(tenant.organizationId);
    if (tenant.organizationId) queryParams.push(tenant.organizationId);

    const synapses = await db.all(`
      WITH RECURSIVE
        traverse(id, depth, weight) AS (
          SELECT id, 0, 1.0 FROM genome_decisions gd WHERE id IN (${placeholders})${ownerClause}${orgClause}
          UNION
          SELECT
            CASE WHEN ms.source_id = t.id THEN ms.target_id ELSE ms.source_id END,
            t.depth + 1,
            ms.weight
          FROM traverse t
          JOIN memory_synapses ms ON (ms.source_id = t.id OR ms.target_id = t.id)${synapseOrgClause}
          WHERE t.depth < 2 AND ms.weight > 0
        )
      SELECT id, depth, weight FROM traverse WHERE depth > 0
      ORDER BY weight DESC, depth ASC LIMIT 15
    `, queryParams);

    const linkedIds = [];
    const synapseWeightById = new Map();
    for (const s of synapses) {
      if (!topIds.includes(s.id)) {
        linkedIds.push(s.id);
        if (!synapseWeightById.has(s.id) || s.weight > synapseWeightById.get(s.id)) {
          synapseWeightById.set(s.id, s.weight);
        }
      }
    }
    const uniqueLinkedIds = [...new Set(linkedIds)];
    if (!uniqueLinkedIds.length) return [];

    const linkedPlaceholders = uniqueLinkedIds.map(() => '?').join(',');
    const connectedDecisions = await db.all(
      `SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob FROM genome_decisions WHERE id IN (${linkedPlaceholders})${ownerId ? ' AND created_by = ?' : ''}${tenant.organizationId ? ' AND (organization_id = ? OR organization_id IS NULL)' : ''}`,
      tenant.organizationId ? [...uniqueLinkedIds, ...(ownerId ? [ownerId] : []), tenant.organizationId] : [...uniqueLinkedIds, ...(ownerId ? [ownerId] : [])]
    );

    return connectedDecisions.map(item => {
      const edgeWeight = synapseWeightById.get(item.id) ?? 1.0;
      const normalizedEdge = Math.min(2.5, Math.max(0.1, edgeWeight));
      const score = Number(((item.synaptic_weight || 1.0) * 0.4 * normalizedEdge).toFixed(4));
      return {
        id: item.id,
        title: item.title,
        category: item.category,
        status: 'SUCCESS',
        summary: item.content,
        tags: ['genome', item.category, 'graph_association'],
        author: item.created_by,
        createdAt: item.created_at,
        vector: decodeEmbeddingBlob(item.embedding_blob),
        synaptic_weight: item.synaptic_weight || 1.0,
        similarityScore: score,
        cosineMetric: 0.5,
        synaptic_edge_weight: Number(edgeWeight.toFixed(4))
      };
    });
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
          status: 'SUCCESS',
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
          status: 'SUCCESS',
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
    const synapticNeighbors = await traverseSynapses(topIds, db, options.ownerId || '', { organizationId: options.organizationId, projectId: options.projectId });
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
async function ingestDocument(docId, text, dbInstance = null) {
  const db = dbInstance || await getDatabase();
  const { entities, relations } = await nerService.extractEntities(text);

  const content = String(text || '').slice(0, 1000);
  const title = `Document ${docId}`;
  const { embed } = require('./embeddingProvider');
  const vec = (await embed(content)) || textToVector(content);
  const float32 = new Float32Array(vec);
  const buffer = Buffer.from(float32.buffer);
  await db.run(
    `INSERT OR REPLACE INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight)
     VALUES (?, ?, ?, ?, 'graph_rag', 'document', 1.0)`,
    docId, title, content, buffer
  );

  const enriched = await nerService.enrichKnowledgeGraph(db, text, docId);

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
async function queryKnowledgeGraph(query, limit = 5, dbInstance = null) {
  const db = dbInstance || await getDatabase();
  const q = String(query || '').trim();
  if (!q) return { nodes: [], synthesis: 'Empty query' };

  const { entities } = await nerService.extractEntities(q);
  const entityTerms = entities.map(e => e.text);

  let matchedDecisions = [];
  if (entityTerms.length > 0) {
    const placeholders = entityTerms.map(() => '(title LIKE ? OR content LIKE ?)').join(' OR ');
    const params = entityTerms.flatMap(t => [`%${t}%`, `%${t}%`]);
    matchedDecisions = await db.all(
      `SELECT id, title, category, content, synaptic_weight FROM genome_decisions
       WHERE ${placeholders} ORDER BY synaptic_weight DESC LIMIT ?`,
      ...params, limit
    );
  }

  if (matchedDecisions.length === 0) {
    matchedDecisions = await db.all(
      `SELECT id, title, category, content, synaptic_weight FROM genome_decisions
       WHERE title LIKE ? OR content LIKE ? ORDER BY synaptic_weight DESC LIMIT ?`,
      `%${q}%`, `%${q}%`, limit
    );
  }

  const topIds = matchedDecisions.map(d => d.id);
  const synapticNeighbors = await traverseSynapses(topIds, db);

  const allNodes = [...matchedDecisions, ...synapticNeighbors].slice(0, limit * 2);
  const labels = allNodes.map(n => n.title || n.label || n.id);
  const synthesis = `Found ${allNodes.length} graph node(s) linked to '${q}': ${labels.slice(0, 3).join(', ')}`;

  return {
    nodes: allNodes,
    synthesis
  };
}

module.exports = {
  traverseSynapses,
  fetchTemporalAnchors,
  expandGraphRag,
  queryKnowledgeGraph,
  ingestDocument
};
