'use strict';
function containmentErrors(nodes, byId) {
  const errors = [];
  for (const node of nodes) {
    if (typeof node.nodeId !== 'string' || !node.nodeId) errors.push('nodeId must be a non-empty string');
    if (node.children !== undefined && !Array.isArray(node.children)) errors.push('children must be an array');
    checkChildren(node, byId, errors);
  }
  return errors;
}
function checkChildren(node, byId, errors) {
  if (!Array.isArray(node.children)) return;
  if (new Set(node.children).size !== node.children.length) errors.push('duplicate child in ' + node.nodeId);
  for (const id of node.children) {
    const child = byId.get(id);
    if (!child) errors.push('unknown child ' + id);
    else if (child.parentNodeId !== node.nodeId) errors.push('inconsistent parent for child ' + id);
  }
}
module.exports = { containmentErrors };
