'use strict';
const lineage = require('./riskLineage');
const { withTransaction } = require('../../../db');

async function bindGraph(db, graph, contract) {
  return withTransaction(db, async (tx) => {
    const prior = await missionScope(tx, graph);
    if (prior && prior.scope_id !== contract.scopeId) throw new Error('GRAPH_RISK_SCOPE_CONFLICT');
    const result = await createBindings(tx, graph, contract);
    await tx.run('INSERT OR IGNORE INTO morph_risk_missions (mission_id, scope_id) VALUES (?, ?)', [missionKey(graph), contract.scopeId]);
    return result;
  });
}
async function createBindings(db, graph, contract) {
  const existing = await lineage.node(db, graph.rootNodeId);
  if (existing) {
    if (existing.scope_id !== contract.scopeId) throw new Error('GRAPH_RISK_SCOPE_CONFLICT');
    await extendBindings(db, graph, existing);
    await assertBindings(db, graph);
    return existing;
  }
  const root = graph.nodes.find((node) => node.nodeId === graph.rootNodeId);
  const created = await lineage.createScope(db, { ...contract, nodeId: root.nodeId, topology: knownTopology(root) });
  const children = graph.nodes.filter((node) => node.nodeId !== graph.rootNodeId);
  if (!children.length) return created;
  const units = Math.floor(contract.units / (children.length + 1));
  if (units < 1) throw new Error('GRAPH_RISK_ALLOCATION_TOO_SMALL');
  await lineage.fork(db, { nodeId: root.nodeId, parentGrantId: created.grantIds[0], children: children.map((child) => ({
    nodeId: child.nodeId, topology: knownTopology(child), grantId: `${created.grantIds[0]}:${child.nodeId}`, units
  })) });
  return created;
}
function knownTopology(node) {
  return lineage.TOPOLOGIES.includes(node.topology) ? node.topology : 'morphogenesis';
}
async function verifyOutput(db, input) {
  const gate = await require('./statisticalPromotionGate').evaluateForNode(db, input);
  if (!gate.allowed) throw new Error(gate.reason);
  return gate;
}
async function extendBindings(db, graph, owner) {
  const missing = [];
  for (const candidate of graph.nodes) {
    if (!await lineage.node(db, candidate.nodeId)) missing.push(candidate);
  }
  if (!missing.length) return;
  const grant = await db.get('SELECT available_units FROM morph_risk_grants WHERE grant_id = ?', [owner.grantIds[0]]);
  const units = Math.floor(grant.available_units / (missing.length + 1));
  if (units < 1) throw new Error('GRAPH_RISK_ALLOCATION_TOO_SMALL');
  await lineage.fork(db, { nodeId: owner.node_id, parentGrantId: owner.grantIds[0],
    children: missing.map((child) => ({ nodeId: child.nodeId, topology: knownTopology(child),
      grantId: `${owner.grantIds[0]}:${child.nodeId}`, units })) });
}
async function assertBindings(db, graph) {
  const root = await lineage.node(db, graph.rootNodeId);
  const mission = await missionScope(db, graph);
  if (mission && root?.scope_id !== mission.scope_id) throw new Error('GRAPH_RISK_UNBOUND_ROOT');
  if (!root) return;
  for (const candidate of graph.nodes) {
    const owner = await lineage.node(db, candidate.nodeId);
    if (!owner || owner.scope_id !== root.scope_id) throw new Error('GRAPH_RISK_UNBOUND_NODE');
    if (owner.topology !== knownTopology(candidate)) throw new Error('GRAPH_RISK_TOPOLOGY_TRANSITION_REQUIRED');
    if (owner.state !== 'ACTIVE') throw new Error('ACTIVE_RISK_OWNER_REQUIRED');
  }
}
module.exports = { bindGraph, verifyOutput, assertBindings };

function missionKey(graph) {
  const key = graph.missionId || graph.graphId;
  if (!key) throw new Error('GRAPH_RISK_MISSION_ID_REQUIRED');
  return key;
}
async function missionScope(db, graph) {
  if (!db || typeof db.get !== 'function') return null;
  const schema = await db.get("SELECT name FROM sqlite_master WHERE name = 'morph_risk_missions'");
  if (!schema) return null;
  return db.get('SELECT scope_id FROM morph_risk_missions WHERE mission_id = ?', [missionKey(graph)]);
}
