/**
 * Signal Health & Metrics — observability for the signaling pipeline
 */

const { getDatabase } = require('../db');

const metrics = {
  signalsPublished: 0,
  signalsCoalesced: 0,
  signalsSuppressed: 0,
  receptorsDispatched: 0,
  receptorsTriggered: 0,
  dbErrors: 0,
  dbRetries: 0,
  lastSignalAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
};

function recordPublish() {
  metrics.signalsPublished++;
  metrics.lastSignalAt = new Date().toISOString();
}

function recordCoalesced() {
  metrics.signalsCoalesced++;
}

function recordSuppressed() {
  metrics.signalsSuppressed++;
}

function recordDispatch() {
  metrics.receptorsDispatched++;
}

function recordTrigger() {
  metrics.receptorsTriggered++;
}

function recordDbError(error) {
  metrics.dbErrors++;
  metrics.lastErrorAt = new Date().toISOString();
  metrics.lastErrorMessage = error.message;
}

function recordDbRetry() {
  metrics.dbRetries++;
}

function getMetrics() {
  return { ...metrics };
}

function resetMetrics() {
  for (const key of Object.keys(metrics)) {
    if (typeof metrics[key] === 'number') metrics[key] = 0;
    else metrics[key] = null;
  }
}

async function checkHealth() {
  try {
    const db = await getDatabase();
    const row = await db.get('SELECT COUNT(*) as count FROM signal_blobs');
    return {
      healthy: true,
      signalCount: row.count,
      metrics: getMetrics(),
    };
  } catch (e) {
    return {
      healthy: false,
      error: e.message,
      metrics: getMetrics(),
    };
  }
}

module.exports = {
  recordPublish,
  recordCoalesced,
  recordSuppressed,
  recordDispatch,
  recordTrigger,
  recordDbError,
  recordDbRetry,
  getMetrics,
  resetMetrics,
  checkHealth,
  metrics,
};
