'use strict';

const { randomUUID } = require('node:crypto');

const MAX_RECEIPTS = 5000;
const SCOPE = 'agow_broadcast_receipts';

async function record(options) {
  const { agentId } = options;
  if (!agentId) throw new TypeError('AGOW broadcast receipt requires agentId.');
  const persistence = require('./agowStatePersistenceService');
  const loaded = await persistence.load({ scope: SCOPE, agentId, db: options.db });
  const receipts = Array.isArray(loaded.state.receipts) ? loaded.state.receipts : [];
  const { db, ...fields } = options;
  const receipt = { receiptId: randomUUID(), createdAt: Date.now(), ...fields };
  receipts.push(receipt);
  if (receipts.length > MAX_RECEIPTS) receipts.splice(0, receipts.length - MAX_RECEIPTS);
  await persistence.save({ scope: SCOPE, agentId, db: loaded.db, state: { receipts }, version: receipts.length });
  return receipt;
}

async function list(options) {
  const loaded = await require('./agowStatePersistenceService').load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  const receipts = Array.isArray(loaded.state.receipts) ? loaded.state.receipts : [];
  return receipts.filter((receipt) => !options?.frameId || receipt.frameId === options.frameId);
}

module.exports = { record, list, MAX_RECEIPTS };
