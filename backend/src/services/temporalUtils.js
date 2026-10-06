const { decodeEmbeddingBlob } = require('./decodeEmbeddingBlob.js');

function buildTemporalQuery({ baseQuery, ownerId, tenant }) {
  let query = baseQuery;
  const paramsOut = [];
  if (ownerId) { query += ' AND created_by = ?'; paramsOut.push(ownerId); }
  if (tenant.organizationId) { query += ' AND organization_id = ?'; paramsOut.push(tenant.organizationId); }
  if (tenant.projectId) { query += ' AND project_id = ?'; paramsOut.push(tenant.projectId); }
  return { query, params: paramsOut };
}

function mapTemporalResult({ item, tag }) {
  return {
    id: item.id, title: item.title, category: item.category,
    status: item.category === 'Failure' ? 'FAILURE' : 'SUCCESS',
    summary: item.content, tags: ['genome', tag],
    author: item.created_by, createdAt: item.created_at,
    vector: decodeEmbeddingBlob(item.embedding_blob),
    synaptic_weight: item.synaptic_weight || 1.0,
    similarityScore: Number(((item.synaptic_weight || 1.0) * 0.35).toFixed(4)), cosineMetric: 0.45
  };
}

function computeTimeBounds(anchor, horizonMs) {
  const anchorTime = new Date(anchor.createdAt).getTime();
  if (Number.isNaN(anchorTime)) return null;
  return { min: new Date(anchorTime - horizonMs).toISOString(), max: new Date(anchorTime + horizonMs).toISOString() };
}

async function queryTemporalAnchor(params) {
  const { db, anchor, ownerId, options, minTime, maxTime } = params;
  try {
    const pastQuery = 'SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob FROM genome_decisions WHERE created_at < ? AND created_at >= ? AND id != ?';
    const { query: pq, params: pp } = buildTemporalQuery({ baseQuery: pastQuery, ownerId, tenant: options });
    pp.unshift(anchor.createdAt, minTime, anchor.id);
    const prev = await db.get(pq, ...pp);
    const nextQuery = 'SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob FROM genome_decisions WHERE created_at > ? AND created_at <= ? AND id != ?';
    const { query: nq, params: np } = buildTemporalQuery({ baseQuery: nextQuery, ownerId, tenant: options });
    np.unshift(anchor.createdAt, maxTime, anchor.id);
    const next = await db.get(nq, ...np);
    return [prev, next].filter(Boolean).map(item => mapTemporalResult({ item, tag: item.createdAt < anchor.createdAt ? 'temporal_context_past' : 'temporal_context_future' }));
  } catch { return []; }
}

async function fetchTemporalAnchors({ timeAnchors = [], db = null, ownerId = '', options = {} } = {}) {
  if (!db || !timeAnchors.length) return [];
  const horizonHours = Number.isFinite(options.horizonHours) ? options.horizonHours : 24;
  const horizonMs = horizonHours * 3600 * 1000;
  const results = await Promise.all(
    timeAnchors
      .filter(anchor => anchor.createdAt)
      .map(async (anchor) => {
        const timeBounds = computeTimeBounds(anchor, horizonMs);
        if (!timeBounds) return [];
        return queryTemporalAnchor({ db, anchor, ownerId, options, minTime: timeBounds.min, maxTime: timeBounds.max });
      })
  );
  return results.flat();
}

module.exports = { fetchTemporalAnchors, buildTemporalQuery, mapTemporalResult };