/**
 * Deployment health probes.
 *
 * Keep liveness independent from storage so an unhealthy database does not
 * cause the process to be restarted in a loop. Readiness and startup probes
 * perform the dependency check that the container actually relies on.
 */

const { getDatabase } = require('../db');

function probePayload(status, checks = {}) {
  return {
    status,
    service: 'genos-backend',
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
}

function getLiveness(req, res) {
  res.status(200).json(probePayload('ok', { process: 'ok' }));
}

async function getStorageProbe(req, res, probeName) {
  try {
    const db = await getDatabase();
    const result = await db.get('SELECT 1 AS ok');
    if (result?.ok !== 1) throw new Error('database probe returned an unexpected result');

    return res.status(200).json(probePayload('ok', {
      database: 'ok',
      [probeName]: 'complete'
    }));
  } catch (error) {
    return res.status(503).json(probePayload('unavailable', {
      database: 'failed',
      [probeName]: 'incomplete'
    }));
  }
}

function getReadiness(req, res) {
  return getStorageProbe(req, res, 'readiness');
}

function getStartup(req, res) {
  return getStorageProbe(req, res, 'startup');
}

module.exports = {
  getLiveness,
  getReadiness,
  getStartup
};
