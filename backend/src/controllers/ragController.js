const crypto = require('crypto');
const { getDatabase } = require('../db');
const { scopeSql } = require('../middleware/tenant');
const embedding = require('../services/embeddingProvider');
const { configuredStore } = require('../services/vectorStore');
const ner = require('../services/nerService');
const { boundedInteger } = require('./argumentBounds');

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_NAME_LENGTH = 256;

function validateDocumentInput({ name, content }) {
  if (typeof name !== 'string' || !name.trim() || name.length > MAX_DOCUMENT_NAME_LENGTH || typeof content !== 'string' || !content.trim()) {
    return { error: { code: 'INVALID_DOCUMENT', message: 'name and content must be non-empty strings with a valid name length.' } };
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) {
    return { error: { code: 'DOCUMENT_TOO_LARGE', message: `content must not exceed ${MAX_DOCUMENT_BYTES} bytes.` } };
  }
  return null;
}

function validateChunkSize(chunkSize) {
  const size = boundedInteger(chunkSize, 800, 100, 10_000);
  if (chunkSize !== undefined && size !== Number(chunkSize)) {
    return { error: { code: 'INVALID_CHUNK_SIZE', message: 'chunkSize must be an integer between 100 and 10000.' } };
  }
  return { size };
}

function createChunkRecord({ contentChunk, count, vector, id }) {
  const chunk = {
    id: `chunk-${crypto.randomUUID()}`,
    document_id: id,
    chunk_index: count,
    content: contentChunk
  };
  const blob = (vector && vector.length === 768)
    ? Buffer.from(new Float32Array(vector).buffer)
    : null;
  return { chunk, blob };
}

async function processChunk({ db, id, count, contentChunk, store, orgId, projectId }) {
  let vector = null;
  try {
    vector = await embedding.embed(contentChunk);
  } catch (_) {}
  const { chunk, blob } = createChunkRecord({ contentChunk, count, vector, id });
  await db.run(
    'INSERT INTO rag_chunks(id, document_id, chunk_index, content, embedding_json, embedding_blob) VALUES(?,?,?,?,?,?)',
    chunk.id, id, count, contentChunk, vector ? JSON.stringify(vector) : null, blob
  );
  if (store && vector) {
    await store.upsert({ organizationId: orgId, projectId: projectId, chunk, vector });
  }
  return { vector, hadEmbeddings: Boolean(vector && vector.length === 768) };
}

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
    const validationError = validateDocumentInput({ name, content });
    if (validationError) return res.status(400).json(validationError);
    const { size, error } = validateChunkSize(chunkSize);
    if (error) return res.status(400).json(error);
    const id = `doc-${crypto.randomUUID()}`;
    const s = scopeSql(req);
    const store = configuredStore();
    await db.run('INSERT INTO rag_documents(id, name, content_length, organization_id, project_id) VALUES(?,?,?,?,?)', id, name, content.length, ...s.params);

    let count = 0;
    let hadEmbeddings = false;

    for (let start = 0; start < content.length; start += size) {
      const contentChunk = content.slice(start, start + size);
      const result = await processChunk({ db, id, count, contentChunk, store, orgId: req.tenant.organizationId, projectId: req.tenant.projectId });
      if (result.hadEmbeddings) hadEmbeddings = true;
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

function computeLexicalScore(content, terms) {
  return terms.reduce((n, t) => n + (String(content || '').toLowerCase().includes(t) ? 1 : 0), 0) / Math.max(terms.length, 1);
}

function scoreVectorResults(rows, terms) {
  return rows.map(r => {
    const lexicalScore = computeLexicalScore(r.content, terms);
    const score = (r.vectorScore || 0) + (lexicalScore * 0.2);
    return { ...r, score, lexicalScore };
  });
}

function scoreFallbackResults(rows, queryVector, terms) {
  return rows.map(r => {
    let vectorScore = 0;
    try {
      if (queryVector && r.embedding_json) {
        vectorScore = embedding.cosine(queryVector, JSON.parse(r.embedding_json));
      }
    } catch (_) {}
    const lexicalScore = computeLexicalScore(r.content, terms);
    return { ...r, score: vectorScore || lexicalScore, vectorScore, lexicalScore };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);
}

async function searchVectorStore({ store, queryVector, orgId, projectId }) {
  return store.search({ organizationId: orgId, projectId: projectId, vector: queryVector, limit: 20 });
}

async function searchSqliteVec({ db, queryVector, sDoc }) {
  const queryVecJson = JSON.stringify(queryVector);
  return db.all(`
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
    WHERE ${sDoc.clause}
    ORDER BY vm.distance ASC LIMIT 20
  `, queryVecJson, ...sDoc.params);
}

async function searchFallback({ db, s }) {
  return db.all(
    'SELECT c.*, d.name AS document_name FROM rag_chunks c JOIN rag_documents d ON d.id=c.document_id WHERE d.organization_id=? AND d.project_id=? ORDER BY c.created_at DESC LIMIT 50',
    ...s.params
  );
}

async function getQueryVector(raw) {
  try {
    return await embedding.embed(raw);
  } catch (_) {
    return null;
  }
}

async function executeVectorSearch({ db, queryVector, sDoc, terms, store, orgId, projectId }) {
  if (store && queryVector && orgId) {
    return searchVectorStore({ store, queryVector, orgId, projectId });
  }
  if (queryVector && queryVector.length === 768) {
    try {
      const rows = await searchSqliteVec({ db, queryVector, sDoc });
      return scoreVectorResults(rows, terms);
    } catch (vecErr) {
      console.warn('[RAG] sqlite-vec search fallback:', vecErr.message);
    }
  }
  return [];
}

async function executeFallbackSearch({ db, s, queryVector, terms }) {
  const rows = await searchFallback({ db, s });
  return scoreFallbackResults(rows, queryVector, terms);
}

async function searchCandidates({ db, raw, s }) {
  const query = raw.toLowerCase().trim();
  if (!query) return { candidates: [], terms: [] };
  const terms = query.split(/\s+/).filter(Boolean);
  const queryVector = await getQueryVector(raw);
  const sDoc = scopeSql(req, 'd');

  let candidates = await executeVectorSearch({ db, queryVector, sDoc, terms, store: configuredStore(), orgId: req.tenant?.organizationId, projectId: req.tenant?.projectId });

  if (!candidates.length) {
    candidates = await executeFallbackSearch({ db, s, queryVector, terms });
  }

  return { candidates, terms };
}

async function search(req, res, next) {
  try {
    const db = await getDatabase();
    const raw = String(req.body?.query || '');
    const { candidates, terms } = await searchCandidates({ db, raw, s: scopeSql(req) });
    const reranked = await embedding.rerank(raw, candidates);
    res.json(reranked.slice(0, boundedInteger(req.body?.limit, 8, 1, 100)));
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