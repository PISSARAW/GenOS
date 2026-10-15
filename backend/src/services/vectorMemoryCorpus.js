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
  if (projectId && !orgId) throw new Error('Organization scope is required when project scope is provided.');
  // Sans tenant, les requêtes restent limitées aux lignes globales. Avec un
  // tenant, includeGlobal ajoute uniquement les lignes null/null partagées.
  const includeGlobal = options.includeGlobal === true;
  return { ownerId, orgId, projectId, includeGlobal };
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

function parseJsonArray(raw) {
  try {
    const value = JSON.parse(raw || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function decisionProvenance(item) {
  const provenance = {};
  if (item.provenance_record_id) provenance.recordId = item.provenance_record_id;
  if (item.provenance_hash) provenance.hash = item.provenance_hash;
  if (item.evidence_status) provenance.status = item.evidence_status;
  return Object.keys(provenance).length > 0 ? provenance : null;
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
  // Poids signés : l'inhibition GABAergique s'exprime par des poids
  // négatifs (plancher -5.0), le clamp positif les effaçait.
  return Math.max(-5.0, Math.min(5.0, Number(weight || 1.0)));
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

function trajectoryScopeClause(scope, alias) {
  // Sans tenant, seules les trajectoires globales (sans workspace) sont visibles.
  if (!scope.orgId) return { sql: ` AND ${alias}.workspace_id IS NULL`, params: [] };
  if (scope.includeGlobal) {
    const inner = scope.projectId ? ' AND project_id = ?' : '';
    const params = scope.projectId ? [scope.orgId, scope.projectId] : [scope.orgId];
    return { sql: ` AND (${alias}.workspace_id IN (SELECT id FROM workspaces WHERE organization_id = ?${inner}) OR ${alias}.workspace_id IS NULL)`, params };
  }
  const inner = scope.projectId ? ' AND project_id = ?' : '';
  const params = scope.projectId ? [scope.orgId, scope.projectId] : [scope.orgId];
  return { sql: ` AND (${alias}.workspace_id IN (SELECT id FROM workspaces WHERE organization_id = ?${inner}))`, params };
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
  const clause = trajectoryScopeClause(scope, 't');
  sql += clause.sql;
  params.push(...clause.params);
  return { sql, params };
}

function decisionHydrateQuery(rowIds, scope) {
  const placeholders = rowIds.map(() => {
    return '?';
  }).join(',');
  const params = [...rowIds];
  let sql = `SELECT rowid, id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob,
                    evidence_refs_json, evidence_status, provenance_record_id, provenance_hash
                 FROM genome_decisions t WHERE rowid IN (${placeholders})`;
  // Decisions are shared within a tenant; an unscoped call sees only global rows.
  const clause = decisionScopeClause(scope, 't');
  return { sql: sql + clause.sql, params: [...params, ...clause.params] };
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
    evidenceRefs: parseJsonArray(item.evidence_refs_json),
    provenance: decisionProvenance(item),
    vector: decodeEmbeddingBlob(item.embedding_blob),
    distance: vector ? vector.distance : null,
    f_score: fts ? fts.f_score : null,
    rrf_score: (reciprocalRank(vector) + reciprocalRank(fts)) * (0.5 + 0.5 * synapticMultiplier)
  };
}

async function hydrateTrajectories(db, rowIds, ctx) {
  if (rowIds.length === 0) return [];
  const query = trajectoryHydrateQuery(rowIds, ctx.scope);
  const rows = await db.all(query.sql, query.params);
  return rows.map(item => buildTrajectoryItem(item, ctx));
}

async function hydrateDecisions(db, rowIds, ctx) {
  if (rowIds.length === 0) return [];
  const query = decisionHydrateQuery(rowIds, ctx.scope);
  const rows = await db.all(query.sql, query.params);
  return rows.map(item => buildDecisionItem(item, ctx));
}

function trajectoryFallbackOrg(scope) {
  // Même règle qu'en hydration : pas de `OR ... IS NULL` sans scope global.
  if (scope.includeGlobal) {
    const inner = scope.projectId ? ' AND project_id = ?' : '';
    return '(workspace_id IN (SELECT id FROM workspaces WHERE organization_id = ?' + inner + ') OR workspace_id IS NULL)';
  }
  const inner = scope.projectId ? ' AND project_id = ?' : '';
  return '(workspace_id IN (SELECT id FROM workspaces WHERE organization_id = ?' + inner + '))';
}

function trajectoryFallbackQuery(scope) {
  const conditions = [];
  const params = [];
  if (scope.ownerId) {
    conditions.push('author_id = ?');
    params.push(scope.ownerId);
  }
  if (scope.orgId) {
    conditions.push(trajectoryFallbackOrg(scope));
    params.push(scope.orgId);
    if (scope.projectId) params.push(scope.projectId);
  } else conditions.push('workspace_id IS NULL');
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  // RRF après fetch complet : on ramène un large candidat (200) et c'est le
  // scoring RRF/similarité en aval qui trie avant de slicer, pas ce LIMIT.
  const sql = `SELECT id, title, status, author_name, semantic_summary, diff_lines, created_at, embedding_blob FROM trajectories${where} ORDER BY created_at DESC LIMIT 200`;
  return { sql, params };
}

function decisionScopeClause(scope, alias) {
  const prefix = alias ? `${alias}.` : '';
  const organization = `${prefix}organization_id`;
  const project = `${prefix}project_id`;
  if (!scope.orgId) return { sql: ` AND ${organization} IS NULL AND ${project} IS NULL`, params: [] };
  if (!scope.projectId) {
    const sql = scope.includeGlobal
      ? ` AND (${organization} = ? OR (${organization} IS NULL AND ${project} IS NULL))`
      : ` AND ${organization} = ?`;
    return { sql, params: [scope.orgId] };
  }
  const tenant = `(${organization} = ? AND ${project} = ?)`;
  const sql = scope.includeGlobal
    ? ` AND (${tenant} OR (${organization} IS NULL AND ${project} IS NULL))`
    : ` AND ${tenant}`;
  return { sql, params: [scope.orgId, scope.projectId] };
}

function decisionFallbackQuery(scope) {
  const scopeClause = decisionScopeClause(scope, '');
  const where = ` WHERE ${scopeClause.sql.trim().replace(/^AND\s+/, '')}`;
  const sql = `SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob,
                      evidence_refs_json, evidence_status, provenance_record_id, provenance_hash
                 FROM genome_decisions${where} ORDER BY created_at DESC LIMIT 200`;
  return { sql, params: scopeClause.params };
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
    evidenceRefs: parseJsonArray(item.evidence_refs_json),
    provenance: decisionProvenance(item),
    vector: decodeEmbeddingBlob(item.embedding_blob)
  };
}

async function fetchFallbackCorpus(db, scope) {
  const trajectoryQuery = trajectoryFallbackQuery(scope);
  const decisionQuery = decisionFallbackQuery(scope);
  const trajectories = await db.all(trajectoryQuery.sql, trajectoryQuery.params);
  const decisions = await db.all(decisionQuery.sql, decisionQuery.params);
  return [
    ...trajectories.map(item => buildFallbackTrajectoryItem(item)),
    ...decisions.map(item => buildFallbackDecisionItem(item))
  ];
}

async function fetchCorpus(db, query, queryVec) {
  const options = defaultOptions(arguments[3]);
  if (!db) throw new Error('Memory database is unavailable.');
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
