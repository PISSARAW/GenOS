'use strict';

class DependencyIndex {
  constructor() {
    this.nodes = new Map();
    this.reverse = new Map();
  }

  addNode(node = {}) {
    const nodeId = String(node.nodeId || '').trim();
    if (!nodeId) throw new Error('nodeId is required.');
    if (this.nodes.has(nodeId)) throw new Error(`Node '${nodeId}' already exists.`);
    const dependencies = [...new Set((node.dependencies || []).map(String))].sort();
    const stored = { ...node, nodeId, dependencies, status: node.status || 'queued' };
    this.nodes.set(nodeId, stored);
    for (const dependency of dependencies) {
      if (!this.reverse.has(dependency)) this.reverse.set(dependency, new Set());
      this.reverse.get(dependency).add(nodeId);
    }
    return { ...stored };
  }

  getNode(nodeId) {
    const node = this.nodes.get(nodeId);
    return node ? { ...node } : null;
  }

  updateStatus(nodeId, status) {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Unknown node '${nodeId}'.`);
    node.status = status;
    return { ...node };
  }

  directDependents(nodeId) {
    return [...(this.reverse.get(nodeId) || [])].sort();
  }

  descendants(nodeId) {
    const seen = new Set();
    const queue = this.directDependents(nodeId);
    while (queue.length) {
      const current = queue.shift();
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...this.directDependents(current));
    }
    return [...seen];
  }
}

module.exports = { DependencyIndex };
