const crypto = require('crypto');
const { getDatabase } = require('../db');
const { scopeSql } = require('../middleware/tenant');
const embedding = require('../services/embeddingProvider');
const { configuredStore } = require('../services/vectorStore');
const ner = require('../services/nerService');

async function listDocuments(req, res, next) {
  try {
    const db = await getDatabase();
    const s = scopeSql(req);
    res.json(await db.all(`SELECT * FROM rag_documents WHERE ${s.clause} ORDER BY created_at DESC`, ...s.params));
  } catch (e) {
    next(e);
  }
}

async function ingestDocument(req, res, next) {
  try {
    const db = await getDatabase();
    const { name, content = '', chunkSize = 800 } = req.body || {};
    if (!name || !content) {
      return res.status(400).json({ error: { code: 'INVALID_DOCUMENT', message: 'name and content are required.' } });
    }
    const id = `doc-${crypto.randomUUID()}`;
    const s = scopeSql(req);
    const store = configuredStore();
    await db.run('INSERT INTO rag_documents(id, name, content_length, organization_id, project_id) VALUES(?,?,?,?,?)', id, name, content.length, ...s.params);

    const size = Math.max(100, Number(chunkSize) || 800);
    let count = 0;
    let hadEmbeddings = false;

    for (let start = 0; start < content.length; start += size) {
      const contentChunk = content.slice(start, start + size);
      let vector = null;
      try {
        vector = await embedding.embed(contentChunk);
        if (vector && vector.length === 768) hadEmbeddings = true;
      } catch (_) {}

      const chunk = {
        id: `chunk-${crypto.randomUUID()}`,
        document_id: id,
        chunk_index: count,
        content: contentChunk
      };
      const blob = (vector && vector.length === 768)
        ? Buffer.from(new Float32Array(vector).buffer)
        : null;

      await db.run(
        'INSERT INTO rag_chunks(id, document_id, chunk_index, content, embedding_json, embedding_blob) VALUES(?,?,?,?,?,?)',
        chunk.id, id, count, contentChunk, vector ? JSON.stringify(vector) : null, blob
      );

      if (store && vector) {
        await store.upsert({
          organizationId: req.tenant.organizationId,
          projectId: req.tenant.projectId,
          chunk,
          vector
        });
      }
      count++;
    }

    res.status(201).json({
      id,
      name,
      chunks: count,
      embeddings: hadEmbeddings,
      vectorStore: store ? 'qdrant' : 'sqlite'
    });
  } catch (e) {
    next(e);
  }
}

async function listChunks(req, res, next) {
  try {
    const db = await getDatabase();
    const s = scopeSql(req);
    res.json(await db.all(
      `SELECT c.* FROM rag_chunks c JOIN rag_documents d ON d.id=c.document_id WHERE c.document_id=? AND d.organization_id=? AND d.project_id=? ORDER BY c.chunk_index`,
      req.params.id, ...s.params
    ));
  } catch (e) {
    next(e);
  }
}

async function search(req, res, next) {
  try {
    const db = await getDatabase();
    const raw = String(req.body?.query || '');
    const query = raw.toLowerCase().trim();
    if (!query) return res.json([]);
    const terms = query.split(/\s+/).filter(Boolean);
    const s = scopeSql(req);

    let queryVector = null;
    try {
      queryVector = await embedding.embed(raw);
    } catch (_) {}

    const store = configuredStore();
    let candidates = [];

    if (store && queryVector) {
      candidates = await store.search({
        organizationId: req.tenant.organizationId,
        projectId: req.tenant.projectId,
        vector: queryVector,
        limit: 20
      });
    } else if (queryVector && queryVector.length === 768) {
      // Native sqlite-vec accelerated vector query
      try {
        const queryVecJson = JSON.stringify(queryVector);
        const rows = await db.all(`
          WITH vector_matches AS (
            SELECT rowid, distance, row_number() OVER (ORDER BY distance ASC) as v_rank
            FROM rag_chunks_vec
            WHERE embedding MATCH ? AND k = 20
          )
          SELECT c.*, d.name AS document_name, vm.distance,
                 (1.0 / (60 + vm.v_rank)) as vectorScore
          FROM vector_matches vm
          JOIN rag_chunks c ON c.rowid = vm.rowid
          JOIN rag_documents d ON d.id = c.document_id
          WHERE d.organization_id = ? AND d.project_id = ?
          ORDER BY vm.distance ASC LIMIT 20
        `, queryVecJson, req.tenant.organizationId, req.tenant.projectId);

        candidates = rows.map(r => {
          const lexicalScore = terms.reduce((n, t) => n + (String(r.content || '').toLowerCase().includes(t) ? 1 : 0), 0) / Math.max(terms.length, 1);
          const score = (r.vectorScore || 0) + (lexicalScore * 0.2);
          return { ...r, score, lexicalScore };
        });
      } catch (vecErr) {
        console.warn('[RAG] sqlite-vec search fallback:', vecErr.message);
      }
    }

    // Fallback: bounded lexical query if vector search returned nothing
    if (!candidates.length) {
      const rows = await db.all(
        'SELECT c.*, d.name AS document_name FROM rag_chunks c JOIN rag_documents d ON d.id=c.document_id WHERE d.organization_id=? AND d.project_id=? ORDER BY c.created_at DESC LIMIT 50',
        ...s.params
      );
      candidates = rows.map(r => {
        let vectorScore = 0;
        try {
          if (queryVector && r.embedding_json) {
            vectorScore = embedding.cosine(queryVector, JSON.parse(r.embedding_json));
          }
        } catch (_) {}
        const lexicalScore = terms.reduce((n, t) => n + (String(r.content || '').toLowerCase().includes(t) ? 1 : 0), 0) / Math.max(terms.length, 1);
        return { ...r, score: vectorScore || lexicalScore, vectorScore, lexicalScore };
      }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);
    }

    const reranked = await embedding.rerank(raw, candidates);
    res.json(reranked.slice(0, Number(req.body?.limit) || 8));
  } catch (e) {
    next(e);
  }
}

async function extractEntities(req, res, next) {
  try {
    const text = String(req.body?.text || '');
    if (!text) return res.status(400).json({ error: { code: 'TEXT_REQUIRED', message: 'text is required.' } });
    const result = await ner.extractEntities(text);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

module.exports = { listDocuments, ingestDocument, listChunks, search, extractEntities };
