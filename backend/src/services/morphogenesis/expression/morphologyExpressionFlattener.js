'use strict';

function flattenExpression(expr) {
  const nodes = [];
  const edges = [];
  let nodeCounter = 0;

  function visit(node, parentId = null) {
    const nodeId = `node_${nodeCounter++}`;
    const flatNode = {
      nodeId,
      kind: node.nodeKind || node.kind,
      topology: node.topology || null,
      variant: node.variant || null,
      operator: node.kind !== 'TOPOLOGY' ? node.kind : null,
      parentNodeId: parentId,
      scope: node.scope,
      mission: node.mission,
      budget: node.budget || {},
      ports: node.ports || []
    };
    nodes.push(flatNode);

    if (parentId) {
      edges.push({ edgeId: `edge_${parentId}_${nodeId}`, type: 'CONTAINS', fromNodeId: parentId, toNodeId: nodeId });
    }

    const handlers = {
      NEST: () => { visit(node.host, nodeId); visit(node.inner, nodeId); },
      GATE: () => { visit(node.condition, nodeId); visit(node.thenBranch, nodeId); visit(node.elseBranch, nodeId); },
      WRAP: () => { visit(node.inner, nodeId); },
      BRIDGE: () => { visit(node.source, nodeId); visit(node.target, nodeId); },
      FEDERATE: () => { node.members?.forEach(member => visit(member, nodeId)); }
    };

    if (handlers[node.kind]) handlers[node.kind]();
    else if (Array.isArray(node.children)) node.children.forEach(child => visit(child, nodeId));

    return nodeId;
  }

  visit(expr);
  return { nodes, edges };
}

module.exports = { flattenExpression };