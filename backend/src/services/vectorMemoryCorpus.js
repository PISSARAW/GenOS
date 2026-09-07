/**
 * GenOS Vector Memory - Corpus Fetching & Hybrid Search Hydration
 */
const SEED_EXPERIENCES = [
  { id: 'exp-001', title: 'Enabled SQLite WAL for concurrent agents', category: 'Database', status: 'SUCCESS', summary: 'Switched the journal mode to wal so multiple agent workers can read while one writes without locking timeouts.', tags: ['sqlite', 'wal', 'concurrency'], author: 'memory_seed', createdAt: '2026-09-01T08:00:00.000Z' },
  { id: 'seed-exp-bisect', title: 'Causal bisection isolated timeout culprit', category: 'Resilience', status: 'SUCCESS', summary: 'Ran bisection over workspace snapshots to isolate the commit that introduced the recursion timeout.', tags: ['bisection', 'timeout', 'tree'], author: 'memory_seed', createdAt: '2026-09-02T10:30:00.000Z' },
  { id: 'seed-exp-rbac', title: 'Hardened RBAC with CSRF double submit', category: 'Security', status: 'SUCCESS', summary: 'Enforced per-route permissions and backend-minted csrf tokens across the control plane.', tags: ['security', 'rbac', 'csrf'], author: 'memory_seed', createdAt: '2026-09-03T14:15:00.000Z' },
  { id: 'seed-exp-entropy', title: 'Detected swarm cognitive drift via Shannon entropy', category: 'Swarm', status: 'SUCCESS', summary: 'Watched shannon entropy of agent action distributions and throttled runaway diversity.', tags: ['entropy', 'shannon', 'pareto'], author: 'memory_seed', createdAt: '2026-09-04T09:00:00.000Z' },
  { id: 'seed-pitfall-lock', title: 'Write lock contention under deferred transactions', category: 'Database', status: 'FAILURE', summary: 'Opening parallel write transactions caused immediate busy errors; serialize writers instead.', tags: ['sqlite', 'wal', 'timeout'], author: 'memory_seed', createdAt: '2026-09-05T16:45:00.000Z' }
];

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

async function fetchCorpus(db, query, queryVec, options = {}) {
  if (!db) return [];
  const ownerId = String(options.ownerId || '').trim();
  const orgId = String(options.organizationId || '').trim();
  const orgFilter = orgId ? ' AND (t.organization_id = ? OR t.organization_id IS NULL)' : '';
  const ownerFilter = ownerId ? ' AND t.created_by = ?' : '';
  const validVec = Array.isArray(queryVec) && queryVec.length === 768 ? queryVec : null;
  const queryVecJson = validVec ? JSON.stringify(Array.from(validVec)) : null;
  const cleanQuery = query.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
  const rawTokens = cleanQuery.split(/\s+/).filter(w => w.length > 0);
  const tokens = rawTokens.length > 1
    ? rawTokens.filter(w => w.length > 1 || /\d/.test(w))
    : rawTokens;
  const ftsMatch = tokens.length > 0
    ? tokens.map(w => `"${w.replace(/"/g, '""')}"`).join(' OR ')
    : null;

  // 1. Decoupled Vector Matches
  const trajVectorMap = new Map();
  const decVectorMap = new Map();
  if (queryVecJson) {
    try {
      const vRows = await db.all(
        `SELECT rowid, distance FROM trajectories_vec WHERE embedding MATCH ? AND k = 50`,
        [queryVecJson]
      );
      vRows.forEach((r, idx) => {
        trajVectorMap.set(r.rowid, { distance: r.distance, rank: idx + 1 });
      });
    } catch (err) {
      console.warn('[VectorMemory] trajectories_vec query failed:', err.message);
    }

    try {
      const vRows = await db.all(
        `SELECT rowid, distance FROM genome_decisions_vec WHERE embedding MATCH ? AND k = 50`,
        [queryVecJson]
      );
      vRows.forEach((r, idx) => {
        decVectorMap.set(r.rowid, { distance: r.distance, rank: idx + 1 });
      });
    } catch (err) {
      console.warn('[VectorMemory] genome_decisions_vec query failed:', err.message);
    }
  }

  // 2. Decoupled FTS5 Matches
  const trajFtsMap = new Map();
  const decFtsMap = new Map();
  if (ftsMatch) {
    try {
      const fRows = await db.all(
        `SELECT rowid, -bm25(trajectories_fts) as f_score 
         FROM trajectories_fts WHERE trajectories_fts MATCH ? 
         ORDER BY f_score DESC LIMIT 50`,
        [ftsMatch]
      );
      fRows.forEach((r, idx) => {
        trajFtsMap.set(r.rowid, { f_score: r.f_score, rank: idx + 1 });
      });
    } catch (err) {
      console.warn('[VectorMemory] trajectories_fts query failed:', err.message);
    }

    try {
      const fRows = await db.all(
        `SELECT rowid, -bm25(genome_decisions_fts) as f_score 
         FROM genome_decisions_fts WHERE genome_decisions_fts MATCH ? 
         ORDER BY f_score DESC LIMIT 50`,
        [ftsMatch]
      );
      fRows.forEach((r, idx) => {
        decFtsMap.set(r.rowid, { f_score: r.f_score, rank: idx + 1 });
      });
    } catch (err) {
      console.warn('[VectorMemory] genome_decisions_fts query failed:', err.message);
    }
  }

  // 3. Hydrate matching rows and compute RRF
  const trajRowIds = Array.from(new Set([...trajVectorMap.keys(), ...trajFtsMap.keys()]));
  const decRowIds = Array.from(new Set([...decVectorMap.keys(), ...decFtsMap.keys()]));
  const items = [];

  if (trajRowIds.length > 0) {
    try {
      const placeholders = trajRowIds.map(() => '?').join(',');
      const queryParams = [...trajRowIds];
      let sql = `SELECT rowid, id, title, status, author_name, semantic_summary, diff_lines, created_at, embedding_blob 
                 FROM trajectories t WHERE rowid IN (${placeholders})`;
      if (ownerId) {
        sql += ' AND t.author_id = ?';
        queryParams.push(ownerId);
      }
      if (orgId) {
        sql += ' AND (t.workspace_id IN (SELECT id FROM workspaces WHERE organization_id = ?) OR t.workspace_id IS NULL)';
        queryParams.push(orgId);
      }
      const rows = await db.all(sql, queryParams);
      for (const item of rows) {
        const v = trajVectorMap.get(item.rowid);
        const f = trajFtsMap.get(item.rowid);
        const vRankScore = v ? 1.0 / (60 + v.rank) : 0.0;
        const fRankScore = f ? 1.0 / (60 + f.rank) : 0.0;
        let diffLines = [];
        try { diffLines = JSON.parse(item.diff_lines || '[]'); } catch {}
        items.push({
          id: item.id,
          title: item.title,
          category: 'Trajectory',
          status: item.status === 'rejected' ? 'FAILURE' : 'SUCCESS',
          summary: item.semantic_summary || diffLines.map(l => l.content || l.text || l).join(' '),
          tags: ['trajectory', item.status],
          author: item.author_name,
          createdAt: item.created_at,
          vector: decodeEmbeddingBlob(item.embedding_blob),
          distance: v ? v.distance : null,
          f_score: f ? f.f_score : null,
          rrf_score: vRankScore + fRankScore
        });
      }
    } catch (err) {
      console.warn('[VectorMemory] Failed to hydrate trajectory rows:', err.message);
    }
  }

  if (decRowIds.length > 0) {
    try {
      const placeholders = decRowIds.map(() => '?').join(',');
      const queryParams = [...decRowIds];
      let sql = `SELECT rowid, id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob 
                 FROM genome_decisions t WHERE rowid IN (${placeholders})`;
      if (orgId) {
        sql += orgFilter;
        queryParams.push(orgId);
      }
      const rows = await db.all(sql, queryParams);
      for (const item of rows) {
        const v = decVectorMap.get(item.rowid);
        const f = decFtsMap.get(item.rowid);
        const vRankScore = v ? 1.0 / (60 + v.rank) : 0.0;
        const fRankScore = f ? 1.0 / (60 + f.rank) : 0.0;
        items.push({
          id: item.id,
          title: item.title,
          category: item.category,
          status: item.category === 'Failure' ? 'FAILURE' : 'SUCCESS',
          summary: item.content,
          tags: ['genome', item.category],
          author: item.created_by,
          createdAt: item.created_at,
          synaptic_weight: item.synaptic_weight,
          vector: decodeEmbeddingBlob(item.embedding_blob),
          distance: v ? v.distance : null,
          f_score: f ? f.f_score : null,
          rrf_score: vRankScore + fRankScore
        });
      }
    } catch (err) {
      console.warn('[VectorMemory] Failed to hydrate decision rows:', err.message);
    }
  }

  if (items.length > 0) {
    items.sort((a, b) => (b.rrf_score || 0) - (a.rrf_score || 0));
    return items.slice(0, 50);
  }

  // Fallback: standard SQL table scan
  try {
    const ownerParams = ownerId ? [ownerId] : [];
    const trajectories = await db.all(`SELECT id, title, status, author_name, semantic_summary, diff_lines, created_at, embedding_blob FROM trajectories${ownerId ? ' WHERE author_id = ?' : ''} ORDER BY created_at DESC LIMIT 50`, ownerParams);
    const decisions = await db.all(`SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob FROM genome_decisions${ownerFilter ? ' WHERE created_by = ?' : ''} ORDER BY created_at DESC LIMIT 50`, ownerParams);
    return [
      ...trajectories.map(item => {
        let diffLines = [];
        try { diffLines = JSON.parse(item.diff_lines || '[]'); } catch {}
        return {
          id: item.id,
          title: item.title,
          category: 'Trajectory',
          status: item.status === 'rejected' ? 'FAILURE' : 'SUCCESS',
          summary: item.semantic_summary || diffLines.map(l => l.content || l.text || l).join(' '),
          tags: ['trajectory', item.status],
          author: item.author_name,
          createdAt: item.created_at,
          vector: decodeEmbeddingBlob(item.embedding_blob)
        };
      }),
      ...decisions.map(item => ({
        id: item.id,
        title: item.title,
        category: item.category,
        status: item.category === 'Failure' ? 'FAILURE' : 'SUCCESS',
        summary: item.content,
        tags: ['genome', item.category],
        author: item.created_by,
        createdAt: item.created_at,
        synaptic_weight: item.synaptic_weight,
        vector: decodeEmbeddingBlob(item.embedding_blob)
      }))
    ];
  } catch {
    return [];
  }
}

module.exports = {
  SEED_EXPERIENCES,
  decodeEmbeddingBlob,
  fetchCorpus
};
