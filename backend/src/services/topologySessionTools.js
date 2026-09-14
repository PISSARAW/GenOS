'use strict';

/**
 * @file topologySessionTools.js
 * @description MCP-facing operations for durable topology sessions. Loads the
 * session record to know its topology and dispatches to the matching
 * coordination service, so workers in other processes can contribute.
 */
const store = require('./topologySessionStore');
const syncytium = require('./syncytiumCoordinationService');
const rhizome = require('./rhizomeCoordinationService');

async function sessionSnapshot(db, sessionId, record) {
  if (record.topology === 'syncytium') return syncytium.snapshot(sessionId, { db });
  return { sessionId, ...(await rhizome.coherence(sessionId, { db })) };
}

async function applyTopologyOperation(db, args = {}) {
  const sessionId = String(args.session_id || args.sessionId || '').trim();
  const operation = String(args.operation || '').trim().toLowerCase();
  if (!sessionId) throw new Error('session_id is required.');
  const record = await store.load(db, sessionId);
  if (!record) throw new Error(`Unknown topology session '${sessionId}'.`);
  if (operation === 'snapshot') return sessionSnapshot(db, sessionId, record);
  if (record.topology === 'syncytium' && operation === 'apply') return syncytium.applyOperation(sessionId, args.op || {}, { db });
  if (record.topology === 'rhizome' && operation === 'deposit') return rhizome.depositTrail(sessionId, args.marker || args.key, { db, amount: args.amount, isRepellent: args.is_repellent });
  if (record.topology === 'rhizome' && operation === 'route') return rhizome.routeToCapability(sessionId, args.need, { db });
  if (record.topology === 'rhizome' && operation === 'slime') return rhizome.runSlimeMouldStep(sessionId, args.edges || [], { db });
  throw new Error(`Unsupported operation '${operation}' for ${record.topology} session.`);
}

module.exports = { applyTopologyOperation };
