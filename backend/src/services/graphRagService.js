/**
 * GenOS Cognitive Memory - GraphRAG & Spreading Activation Service
 * Recursive SQLite CTE traversal, Hippocampal Time Cells, and Vector Spreading Activation
 */

const { cosineSimilarity } = require('./memoryScoring');

/**
 * Traverses memory_synapses graph up to 2 hops using SQLite recursive CTE
 * @param {string[]} topIds
 * @param {object} db
 * @returns {Promise<object[]>}
 */
async function traverseSynapses(topIds = [], db = null, ownerId = '') {
  if (!db || !topIds.length) return [];

  const placeholders = topIds.map(() => '?').join(',');
  try {
    const ownerClause = ownerId ? ' AND gd.created_by = ?' : '';
    const ownerParams = ownerId ? [ownerId] : [];
    const synapses = await db.all(`
      WITH RECURSIVE
        traverse(id, depth, weight) AS (
          SELECT id, 0, 1.0 FROM genome_decisions gd WHERE id IN (${placeholders})${ownerClause}
          UNION
          SELECT
            CASE WHEN ms.source_id = t.id THEN ms.target_id ELSE ms.source_id END,
            t.depth + 1,
            ms.weight
          FROM traverse t
          JOIN memory_synapses ms ON ms.source_id = t.id OR ms.target_id = t.id
          WHERE t.depth < 2 AND ms.weight > 0
        )
      SELECT id, depth, weight FROM traverse WHERE depth > 0
      ORDER BY weight DESC, depth ASC LIMIT 15
    `, [...topIds, ...ownerParams]);

    const linkedIds = [];
    for (const s of synapses) {
      if (!topIds.includes(s.id)) linkedIds.push(s.id);
    }
    const uniqueLinkedIds = [...new Set(linkedIds)];
    if (!uniqueLinkedIds.length) return [];

    const linkedPlaceholders = uniqueLinkedIds.map(() => '?').join(',');
    const connectedDecisions = await db.all(
      `SELECT id, title, category, content, created_by, created_at, synaptic_weight FROM genome_decisions WHERE id IN (${linkedPlaceholders})${ownerId ? ' AND created_by = ?' : ''}`,
      [...uniqueLinkedIds, ...ownerParams]
    );

    return connectedDecisions.map(item => ({
      id: item.id,
      title: item.title,
      category: item.category,
      status: 'SUCCESS',
      summary: item.content,
      tags: ['genome', item.category, 'graph_association'],
      author: item.created_by,
      createdAt: item.created_at,
      vector: [],
      synaptic_weight: item.synaptic_weight || 1.0,
      similarityScore: Number(((item.synaptic_weight || 1.0) * 0.4).toFixed(4)),
      cosineMetric: 0.5
    }));
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
async function fetchTemporalAnchors(timeAnchors = [], db = null, ownerId = '') {
  if (!db || !timeAnchors.length) return [];
  const temporalItems = [];

  for (const anchor of timeAnchors) {
    if (!anchor.createdAt) continue;

    try {
      const ownerClause = ownerId ? ' AND created_by = ?' : '';
      const ownerParams = ownerId ? [ownerId] : [];
      const prev = await db.get(
        `SELECT id, title, category, content, created_by, created_at, synaptic_weight FROM genome_decisions WHERE created_at < ? AND id != ?${ownerClause} ORDER BY created_at DESC LIMIT 1`,
        anchor.createdAt, anchor.id, ...ownerParams
      );
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
          vector: [],
          synaptic_weight: prev.synaptic_weight || 1.0,
          similarityScore: Number(((prev.synaptic_weight || 1.0) * 0.35).toFixed(4)),
          cosineMetric: 0.45
        });
      }

      const next = await db.get(
        `SELECT id, title, category, content, created_by, created_at, synaptic_weight FROM genome_decisions WHERE created_at > ? AND id != ?${ownerClause} ORDER BY created_at ASC LIMIT 1`,
        anchor.createdAt, anchor.id, ...ownerParams
      );
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
          vector: [],
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
    .filter(i => i.category !== 'Trajectory' && i.category !== undefined && !String(i.id).startsWith('seed-'))
    .map(i => i.id);

  // 1. Spreading Activation through physical synapses
  if (topIds.length > 0 && db) {
    const synapticNeighbors = await traverseSynapses(topIds, db, options.ownerId || '');
    for (const item of synapticNeighbors) {
      if (!topItems.find(t => t.id === item.id) && !connectedItems.find(c => c.id === item.id)) {
        connectedItems.push(item);
      }
    }
  }

  // 2. Temporal Reasoning (Time Cells)
  if (topItems.length > 0 && db) {
    const timeAnchors = topItems.slice(0, 2);
    const timeNeighbors = await fetchTemporalAnchors(timeAnchors, db, options.ownerId || '');
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
            vector: [],
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
  const float32 = new Float32Array(768);
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
