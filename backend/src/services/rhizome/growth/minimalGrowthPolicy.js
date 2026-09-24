'use strict';

const ACTION_ORDER = Object.freeze([
  'REUSE', 'RECONFIGURE', 'CONNECT', 'BRIDGE', 'ADAPT_PROCEDURE', 'WAKE_DORMANT',
  'ATTACH_SERVICE', 'SPAWN_WORKER', 'SPAWN_SUB_TOPOLOGY'
]);

function choose(candidates) {
  for (const action of ACTION_ORDER) {
    const candidate = candidates.find((item) => item.action === action);
    if (candidate) return candidate;
  }
  return null;
}

module.exports = { choose, ACTION_ORDER };
