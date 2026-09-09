function handleSynapticPruneScale(args, run, getDatabase) {
  const db = await getDatabase();
  const threshold = Number(args.threshold ?? 0.1) * Number(args.scale ?? 1.0);
  const agentId = args.agent_id || args.agentId;
  const orgId = args.organization_id || args.organizationId;
  const projId = args.project_id || args.projectId;
  let prunedCount = 0;
  if (db) {
    let sql = 'DELETE FROM memory_synapses WHERE (ABS(weight) < ? OR (c3_opsonization > 0.5 AND cd47_expression < 0.5))';
    const params = [threshold];
    if (agentId && agentId !== 'global' && agentId !== 'default-agent') {
      sql += ' AND (source_id IN (SELECT id FROM genome_decisions WHERE created_by = ?) OR target_id IN (SELECT id FROM genome_decisions WHERE created_by = ?))';
      params.push(agentId, agentId);
    }
    if (orgId) {
      sql += ' AND (organization_id = ? OR organization_id IS NULL)';
      params.push(orgId);
    }
    if (projId) {
      sql += ' AND (project_id = ? OR project_id IS NULL)';
      params.push(projId);
    }
    const res = await db.run(sql, ...params);
    prunedCount = res?.changes || 0;

    const doomed = await db.all(`
      SELECT g.id FROM genome_decisions g
      LEFT JOIN memory_synapses s ON g.id = s.source_id OR g.id = s.target_id
      WHERE g.synaptic_weight < 0.1
      GROUP BY g.id
      HAVING COUNT(s.source_id) = 0 AND COUNT(s.target_id) = 0
    `);
    if (doomed && doomed.length > 0) {
      const doomedIds = doomed.map(d => d.id);
      const placeholders = doomedIds.map(() => '?').join(',');
      await db.run(`DELETE FROM genome_decisions WHERE id IN (${placeholders})`, ...doomedIds);
    }
  }
  return {
    configured: true, success: true, status: 'completed', transport: 'local_db',
    output: JSON.stringify({ success: true, operation: 'prune_scale', agent_id: agentId || 'global', scale: args.scale ?? 1.0, pruned_synapses: prunedCount })
  };
}

function handleSynapticPruneScaleError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
}

module.exports = { handleSynapticPruneScale, handleSynapticPruneScaleError };
