'use strict';

function tracePropagation(originNodeId, edges = []) {
  const next = new Map();
  for (const edge of edges) {
    const recipients = next.get(edge.from) || [];
    recipients.push(edge.to);
    next.set(edge.from, recipients);
  }
  const reached = new Set();
  const pending = [originNodeId];
  while (pending.length) {
    for (const recipient of next.get(pending.pop()) || []) {
      if (!reached.has(recipient)) { reached.add(recipient); pending.push(recipient); }
    }
  }
  return [...reached];
}

module.exports = { tracePropagation };
