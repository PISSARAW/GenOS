'use strict';

function markDormant(node, reason, now = Date.now()) {
  if (!node || !node.id || !reason) throw new Error('node and dormancy reason are required');
  return { nodeId: node.id, priorLifecycle: node.lifecycle || 'active', lifecycle: 'dormant', reason, evidence: node.evidence || [], since: now };
}

function restoreDormant(record) {
  if (!record || record.lifecycle !== 'dormant') return { restored: false, reason: 'node is not dormant' };
  return { restored: true, nodeId: record.nodeId, lifecycle: record.priorLifecycle || 'active', evidence: record.evidence || [] };
}

module.exports = { markDormant, restoreDormant };
