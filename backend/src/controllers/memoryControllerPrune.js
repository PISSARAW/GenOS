const { getDatabase } = require('../db');

function getTenantScope(req, prefix = '') {
  const p = prefix ? `${prefix}.` : '';
  const orgId = req.tenant.organizationId;
  const projId = req.tenant.projectId;

  if (orgId && projId) {
    return {
      clause: `${p}organization_id = ? AND ${p}project_id = ?`,
      params: [orgId, projId],
      orgId,
      projId
    };
  } else if (orgId) {
    return {
      clause: `${p}organization_id = ?`,
      params: [orgId],
      orgId,
      projId: null
    };
  }
  return {
    clause: `(${p}organization_id IS NULL AND ${p}project_id IS NULL)`,
    params: [],
    orgId: null,
    projId: null
  };
}

async function pruneSynapses(req, res, next) {
  try {
    const { agentId, threshold = 0.5, scale = 1.0, c3Threshold = 0.5, cd47Threshold = 0.5 } = req.body || {};
    const db = await getDatabase();
    const th = Number(threshold) * Number(scale);
    const c3Th = Number(c3Threshold);
    const cd47Th = Number(cd47Threshold);
    const scope = getTenantScope(req);

    let sql = `
      DELETE FROM memory_synapses
      WHERE (ABS(weight) < ? OR (c3_opsonization > ? AND cd47_expression < ?))
        AND ${scope.clause}
    `;
    const params = [th, c3Th, cd47Th, ...scope.params];

    if (agentId && agentId !== 'global' && agentId !== 'default-agent') {
      sql += ` AND (source_id IN (SELECT id FROM genome_decisions WHERE created_by = ?)
               OR target_id IN (SELECT id FROM genome_decisions WHERE created_by = ?))`;
      params.push(agentId, agentId);
    }

    const resDb = await db.run(sql, ...params);
    const prunedCount = resDb?.changes || 0;

    const doomedScope = getTenantScope(req, 'g');
    const doomed = await db.all(`
      SELECT g.id 
      FROM genome_decisions g
      LEFT JOIN memory_synapses s ON g.id = s.source_id OR g.id = s.target_id
      WHERE g.synaptic_weight < 0.1 AND ${doomedScope.clause}
      GROUP BY g.id
      HAVING COUNT(s.source_id) = 0 AND COUNT(s.target_id) = 0
    `, ...doomedScope.params);
    let orphanedDecisionsPruned = 0;
    if (doomed && doomed.length > 0) {
      const doomedIds = doomed.map(d => d.id);
      const placeholders = doomedIds.map(() => '?').join(',');
      const delRes = await db.run(`DELETE FROM genome_decisions WHERE id IN (${placeholders})`, ...doomedIds);
      orphanedDecisionsPruned = delRes?.changes || doomedIds.length;
    }

    res.json({
      success: true,
      operation: 'agent_prune',
      agent_id: agentId || 'global',
      organization_id: scope.orgId,
      project_id: scope.projId,
      threshold: th,
      c3_threshold: c3Th,
      cd47_threshold: cd47Th,
      pruned_synapses: prunedCount,
      orphaned_decisions_pruned: orphanedDecisionsPruned
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTenantScope,
  pruneSynapses
};
