'use strict';

const { normalizeCapabilityNode } = require('../contracts/capabilityNode');

function register(nodes, input) {
  const node = normalizeCapabilityNode(input);
  if (nodes.some((item) => item.nodeId === node.nodeId)) {
    throw Object.assign(new Error(`Rhizome node '${node.nodeId}' already exists.`), { code: 'RHIZOME_NODE_EXISTS' });
  }
  return [...nodes, node];
}

function find(nodes, nodeId) {
  return nodes.find((node) => node.nodeId === nodeId) || null;
}

module.exports = { register, find };
