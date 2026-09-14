/**
 * GenOS Vector Memory - Corpus Fetching & Hybrid Search Hydration
 */
const SEED_EXPERIENCES = [
  { id: 'exp-001', title: 'Enabled SQLite WAL for concurrent agents', category: 'Database', status: 'SUCCESS', summary: 'Switched the journal mode to wal so multiple agent workers can read while one writes without locking timeouts.', tags: ['sqlite', 'wal', 'concurrency', 'golden_path'], author: 'memory_seed', createdAt: '2026-09-01T08:00:00.000Z' },
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

function defaultOptions(value) {
  return value === undefined ? {} : value;
}

function buildScope(options) {
  const ownerId = String(options.ownerId || '').trim();
  const orgId = String(options.organizationId || '').trim();
  const projectId = String(options.projectId || '').trim();
  return { ownerId, orgId, projectId };
}

function tokenizeQuery(query) {
  const cleanQuery = query.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
  const rawTokens = cleanQuery.split(/\s+/).filter(w => {
    return w.length > 0;
  });
  if (rawTokens.length <= 1) return rawTokens;
  return rawTokens.filter(w => {
    return w.length > 1 || /\d/.test(w);
  });
}

function buildFtsMatch(tokens) {
  if (tokens.length === 0) return null;
  return tokens.map(w => {
    return `"${w.replace(/"/g, '""')}"`;
  }).join(' OR ');
}

function parseDiffLines(raw) {
  try {
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

function diffSummary(diffLines) {
  return diffLines.map(l => {
    return l.content || l.text || l;
  }).join(' ');
}

function reciprocalRank(entry) {
  return entry ? 1.0 / (60 + entry.rank) : 0.0;
}

function clampSynaptic(weight) {
  return Math.max(0.1, Math.min(5.0, Number(weight || 1.0)));
}

function collectRowIds(vectorMap, ftsMap) {
  return Array.from(new Set([...vectorMap.keys(), ...ftsMap.keys()]));
}

async function fetchVectorMap(db, table, queryVecJson) {
  const map = new Map();
  if (!queryVecJson) return map;
  try {
    const rows = await db.all(
      `SELECT rowid, distance FROM ${table} WHERE embedding MATCH ? AND k = 1000`,
      [queryVecJson]
    );
    rows.forEach((r, idx) => {
      map.set(r.rowid, { distance: r.distance, rank: idx + 1 });
    });
  } catch (err) {
    console.warn(`[VectorMemory] ${table} query failed:`, err.message);
  }
  return map;
}

async function fetchFtsMap(db, table, ftsMatch) {
  const map = new Map();
  if (!ftsMatch) return map;
  try {
    const rows = await db.all(
      `SELECT rowid, -bm25(${table}) as f_score 
         FROM ${table} WHERE ${table} MATCH ? 
         ORDER BY f_score DESC LIMIT 1000`,
      [ftsMatch]
    );
    rows.forEach((r, idx) => {
      map.set(r.rowid, { f_score: r.f_score, rank: idx + 1 });
    });
  } catch (err) {
    console.warn(`[VectorMemory] ${table} query failed:`, err.message);
  }
  return map;
}

function trajectoryHydrateQuery(rowIds, scope) {
  const placeholders = rowIds.map(() => {
    return '?';
  }).join(',');
  const params = [...rowIds];
  let sql = `SELECT rowid, id, title, status, author_name, semantic_summary, diff_lines, created_at, embedding_blob 
                 FROM trajectories t WHERE rowid IN (${placeholders})`;
  if (scope.ownerId) {
    sql += ' AND t.author_id = ?';
    params.push(scope.ownerId);
  }
  if (scope.orgId) {
    sql += ' AND (t.workspace_id IN (SELECT id FROM workspaces WHERE organization_id = ?' + (scope.projectId ? ' AND project_id = ?' : '') + ') OR t.workspace_id IS NULL)';
    params.push(scope.orgId);
    if (scope.projectId) params.push(scope.projectId);
  }
  return { sql, params };
}

function decisionHydrateQuery(rowIds, scope) {
  const placeholders = rowIds.map(() => {
    return '?';
  }).join(',');
  const params = [...rowIds];
  let sql = `SELECT rowid, id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob 
                 FROM genome_decisions t WHERE rowid IN (${placeholders})`;
  if (scope.ownerId) {
    sql += ' AND t.created_by = ?';
    params.push(scope.ownerId);
  }
  if (scope.orgId) {
    sql += ' AND (t.organization_id = ? OR t.organization_id IS NULL)';
    params.push(scope.orgId);
  }
  if (scope.projectId) {
    sql += ' AND (t.project_id = ? OR t.project_id IS NULL)';
    params.push(scope.projectId);
  }
  return { sql, params };
}

function buildTrajectoryItem(item, ctx) {
  const vector = ctx.trajVectorMap.get(item.rowid);
  const fts = ctx.trajFtsMap.get(item.rowid);
  return {
    id: item.id,
    title: item.title,
    category: 'Trajectory',
    status: item.status === 'rejected' ? 'FAILURE' : 'SUCCESS',
    summary: item.semantic_summary || diffSummary(parseDiffLines(item.diff_lines)),
    tags: ['trajectory', item.status],
    author: item.author_name,
    createdAt: item.created_at,
    vector: decodeEmbeddingBlob(item.embedding_blob),
    distance: vector ? vector.distance : null,
    f_score: fts ? fts.f_score : null,
    rrf_score: reciprocalRank(vector) + reciprocalRank(fts)
  };
}

function buildDecisionItem(item, ctx) {
  const vector = ctx.decVectorMap.get(item.rowid);
  const fts = ctx.decFtsMap.get(item.rowid);
  const synapticMultiplier = clampSynaptic(item.synaptic_weight);
  return {
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
    distance: vector ? vector.distance : null,
    f_score: fts ? fts.f_score : null,
    rrf_score: (reciprocalRank(vector) + reciprocalRank(fts)) * (0.5 + 0.5 * synapticMultiplier)
  };
}

async function hydrateTrajectories(db, rowIds, ctx) {
  if (rowIds.length === 0) return [];
  try {
    const query = trajectoryHydrateQuery(rowIds, ctx.scope);
    const rows = await db.all(query.sql, query.params);
    return rows.map(item => {
      return buildTrajectoryItem(item, ctx);
    });
  } catch (err) {
    console.warn('[VectorMemory] Failed to hydrate trajectory rows:', err.message);
    return [];
  }
}

async function hydrateDecisions(db, rowIds, ctx) {
  if (rowIds.length === 0) return [];
  try {
    const query = decisionHydrateQuery(rowIds, ctx.scope);
    const rows = await db.all(query.sql, query.params);
    return rows.map(item => {
      return buildDecisionItem(item, ctx);
    });
  } catch (err) {
    console.warn('[VectorMemory] Failed to hydrate decision rows:', err.message);
    return [];
  }
}

function trajectoryFallbackOrg(projectId) {
  const inner = projectId ? ' AND project_id = ?' : '';
  return '(workspace_id IN (SELECT id FROM workspaces WHERE organization_id = ?' + inner + ') OR workspace_id IS NULL)';
}

function trajectoryFallbackQuery(scope) {
  const conditions = [];
  const params = [];
  if (scope.ownerId) {
    conditions.push('author_id = ?');
    params.push(scope.ownerId);
  }
  if (scope.orgId) {
    conditions.push(trajectoryFallbackOrg(scope.projectId));
    params.push(scope.orgId);
    if (scope.projectId) params.push(scope.projectId);
  }
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT id, title, status, author_name, semantic_summary, diff_lines, created_at, embedding_blob FROM trajectories${where} ORDER BY created_at DESC LIMIT 50`;
  return { sql, params };
}

function decisionFallbackQuery(scope) {
  const conditions = [];
  const params = [];
  if (scope.ownerId) {
    conditions.push('created_by = ?');
    params.push(scope.ownerId);
  }
  if (scope.orgId) {
    conditions.push('(organization_id = ? OR organization_id IS NULL)');
    params.push(scope.orgId);
  }
  if (scope.projectId) {
    conditions.push('(project_id = ? OR project_id IS NULL)');
    params.push(scope.projectId);
  }
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob FROM genome_decisions${where} ORDER BY created_at DESC LIMIT 50`;
  return { sql, params };
}

function buildFallbackTrajectoryItem(item) {
  return {
    id: item.id,
    title: item.title,
    category: 'Trajectory',
    status: item.status === 'rejected' ? 'FAILURE' : 'SUCCESS',
    summary: item.semantic_summary || diffSummary(parseDiffLines(item.diff_lines)),
    tags: ['trajectory', item.status],
    author: item.author_name,
    createdAt: item.created_at,
    vector: decodeEmbeddingBlob(item.embedding_blob)
  };
}

function buildFallbackDecisionItem(item) {
  return {
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
  };
}

async function fetchFallbackCorpus(db, scope) {
  try {
    const trajectoryQuery = trajectoryFallbackQuery(scope);
    const decisionQuery = decisionFallbackQuery(scope);
    const trajectories = await db.all(trajectoryQuery.sql, trajectoryQuery.params);
    const decisions = await db.all(decisionQuery.sql, decisionQuery.params);
    return [
      ...trajectories.map(item => {
        return buildFallbackTrajectoryItem(item);
      }),
      ...decisions.map(item => {
        return buildFallbackDecisionItem(item);
      })
    ];
  } catch {
    return [];
  }
}

async function fetchCorpus(db, query, queryVec) {
  const options = defaultOptions(arguments[3]);
  if (!db) return [];
  const scope = buildScope(options);
  const validVec = Array.isArray(queryVec) && queryVec.length === 768 ? queryVec : null;
  const queryVecJson = validVec ? JSON.stringify(Array.from(validVec)) : null;
  const tokens = tokenizeQuery(query);
  const ftsMatch = buildFtsMatch(tokens);
  const ctx = {
    scope,
    trajVectorMap: await fetchVectorMap(db, 'trajectories_vec', queryVecJson),
    decVectorMap: await fetchVectorMap(db, 'genome_decisions_vec', queryVecJson),
    trajFtsMap: await fetchFtsMap(db, 'trajectories_fts', ftsMatch),
    decFtsMap: await fetchFtsMap(db, 'genome_decisions_fts', ftsMatch)
  };
  const trajRowIds = collectRowIds(ctx.trajVectorMap, ctx.trajFtsMap);
  const decRowIds = collectRowIds(ctx.decVectorMap, ctx.decFtsMap);
  const trajItems = await hydrateTrajectories(db, trajRowIds, ctx);
  const decItems = await hydrateDecisions(db, decRowIds, ctx);
  const items = [...trajItems, ...decItems];
  if (items.length > 0) {
    items.sort((a, b) => {
      return (b.rrf_score || 0) - (a.rrf_score || 0);
    });
    return items.slice(0, 50);
  }
  return fetchFallbackCorpus(db, scope);
}

module.exports = {
  SEED_EXPERIENCES,
  decodeEmbeddingBlob,
  fetchCorpus
};
