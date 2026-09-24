'use strict';

function canReach(session, start, target) {
  const visited = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    if (current === target) return true;
    for (const edge of session.edges || []) {
      if (edge.status === 'ACTIVE' && edge.from === current && !visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return false;
}

module.exports = { canReach };
