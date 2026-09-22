const { retryDbOperation } = require('./signalValidationUtils');

async function subscribeAgent(db, subscriberAgentId, topicFilter) {
  if (!db || !subscriberAgentId || !topicFilter) return false;
  const { topic, filter } = normalizeTopicFilter(topicFilter);
  try {
    await retryDbOperation(() => db.run(
      `INSERT OR REPLACE INTO signal_subscriptions (subscriber_agent_id, topic, filter)
       VALUES (?, ?, ?)`,
      [subscriberAgentId, topic, filter]
    ));
    return true;
  } catch (e) {
    console.warn(`[SignalDelivery] subscribeAgent failed: ${e.message}`);
    return false;
  }
}

async function unsubscribeAgent(db, subscriberAgentId, topic) {
  if (!db || !subscriberAgentId || !topic) return false;
  try {
    await retryDbOperation(() => db.run(
      `DELETE FROM signal_subscriptions WHERE subscriber_agent_id = ? AND topic = ?`,
      [subscriberAgentId, topic]
    ));
    return true;
  } catch (e) {
    console.warn(`[SignalDelivery] unsubscribeAgent failed: ${e.message}`);
    return false;
  }
}

async function recordPendingDelivery(db, signalId, subscriberAgentId) {
  if (!db || !signalId || !subscriberAgentId) return false;
  try {
    await retryDbOperation(() => db.run(
      `INSERT OR IGNORE INTO signal_deliveries (signal_id, subscriber_agent_id, status, delivered_at)
       VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)`,
      [signalId, subscriberAgentId]
    ));
    return true;
  } catch (e) {
    console.warn(`[SignalDelivery] recordPendingDelivery failed: ${e.message}`);
    return false;
  }
}

async function markDelivered(db, delivery) {
  if (!db || !delivery) return false;
  const { signalId, subscriberAgentId } = delivery;
  try {
    await retryDbOperation(() => db.run(
      `UPDATE signal_deliveries SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
       WHERE signal_id = ? AND subscriber_agent_id = ? AND status = 'pending'`,
      [signalId, subscriberAgentId]
    ));
    return true;
  } catch (e) {
    console.warn(`[SignalDelivery] markDelivered failed: ${e.message}`);
    return false;
  }
}

async function ackDelivery(db, delivery) {
  if (!db || !delivery) return false;
  const { signalId, subscriberAgentId } = delivery;
  try {
    await retryDbOperation(() => db.run(
      `UPDATE signal_deliveries SET status = 'acked', acked_at = CURRENT_TIMESTAMP
       WHERE signal_id = ? AND subscriber_agent_id = ? AND status != 'acked'`,
      [signalId, subscriberAgentId]
    ));
    return true;
  } catch (e) {
    console.warn(`[SignalDelivery] ackDelivery failed: ${e.message}`);
    return false;
  }
}

async function getPendingDeliveries(db, subscriberAgentId) {
  if (!db || !subscriberAgentId) return [];
  try {
    return await retryDbOperation(() => db.all(
      `SELECT signal_id, subscriber_agent_id, status, delivered_at
       FROM signal_deliveries WHERE subscriber_agent_id = ? AND status = 'pending'
       ORDER BY delivered_at ASC`,
      [subscriberAgentId]
    ));
  } catch (e) {
    console.warn(`[SignalDelivery] getPendingDeliveries failed: ${e.message}`);
    return [];
  }
}

function normalizeTopicFilter(topicFilter) {
  if (typeof topicFilter === 'string') return { topic: topicFilter, filter: null };
  const { topic = '', filter = null } = topicFilter || {};
  return { topic, filter };
}

module.exports = {
  subscribeAgent,
  unsubscribeAgent,
  recordPendingDelivery,
  markDelivered,
  ackDelivery,
  getPendingDeliveries,
};
