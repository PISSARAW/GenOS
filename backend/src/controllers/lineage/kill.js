/**
 * Lineage node termination (apoptosis) endpoint.
 */

const { getDatabase } = require('../../db');
const telemetry = require('../../services/telemetryObserver');
const { workspaceScope } = require('./helpers');

async function killNode(req, res) {
  const { nodeId, cascade = false } = req.body || {};
  const db = await getDatabase();
  const scope = workspaceScope(req);
  const result = await db.run(`UPDATE lineage_nodes SET state_summary = 'Apoptosis Terminated' WHERE id = ? AND workspace_id IN (SELECT id FROM workspaces w WHERE ${scope.clause})`, nodeId, ...scope.params);
  if (!result.changes) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Node ${nodeId} not found in this project.` } });

  // Terminate actual agent in agents table
  await db.run(
    `UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, cognitive_budget = 0, current_task = 'Apoptosis Terminated via Lineage Controller', updated_at = CURRENT_TIMESTAMP
     WHERE (id = ? OR id = (SELECT agent_id FROM lineage_nodes WHERE id = ?))
       AND workspace_id IN (SELECT id FROM workspaces w WHERE ${scope.clause})`,
    nodeId, nodeId, ...scope.params
  );

  let cascadeCount = 0;
  if (cascade) {
    const childEdges = await db.all(`SELECT target_node_id FROM lineage_edges WHERE source_node_id = ?`, nodeId);
    for (const edge of childEdges) {
      await db.run(
        `UPDATE lineage_nodes SET state_summary = 'Cascaded Apoptosis Terminated' WHERE id = ? AND workspace_id IN (SELECT id FROM workspaces w WHERE ${scope.clause})`,
        edge.target_node_id, ...scope.params
      );
      await db.run(
        `UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, cognitive_budget = 0, current_task = 'Cascaded Apoptosis Terminated', updated_at = CURRENT_TIMESTAMP
         WHERE (id = ? OR id = (SELECT agent_id FROM lineage_nodes WHERE id = ?))
           AND workspace_id IN (SELECT id FROM workspaces w WHERE ${scope.clause})`,
        edge.target_node_id, edge.target_node_id, ...scope.params
      );
      cascadeCount++;
    }
  }

  telemetry.emitEvent({
    eventType: 'NODE_TERMINATED',
    agentId: 'lineage_controller',
    action: 'KILL',
    detail: `Terminated lineage node: ${nodeId}${cascade ? ` (cascaded to ${cascadeCount} children)` : ''}`,
    severity: 'warning'
  });

  res.json({ success: true, message: `Node ${nodeId} terminated successfully.`, cascaded: cascadeCount });
}

module.exports = {
  killNode
};
