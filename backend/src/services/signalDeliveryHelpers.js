const { getDatabase } = require('../db');
const { recordPendingDelivery, markDelivered: markDeliveryDelivered } = require('./signalDeliveryService');

async function recordPendingDeliveries(signalId, recipientAgentIds) {
  if (!signalId || !recipientAgentIds || !recipientAgentIds.length) return;
  const db = await getDatabase();
  for (const recipientId of recipientAgentIds) {
    if (!await recordPendingDelivery(db, signalId, recipientId)) {
      throw new Error(`Failed to persist delivery for ${signalId} to ${recipientId}`);
    }
  }
}

async function markSignalDelivered(signalId, recipientId) {
  if (!signalId || !recipientId) return;
  try {
    const db = await getDatabase();
    await markDeliveryDelivered(db, { signalId, subscriberAgentId: recipientId });
  } catch (err) {
    console.warn(`[SignalPlaneSubscriber] markSignalDelivered failed: ${err.message}`);
  }
}

module.exports = { recordPendingDeliveries, markSignalDelivered };
