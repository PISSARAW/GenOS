'use strict';

/**
 * Observation canonique (G1) : toutes les sources parlent le même langage.
 */

const crypto = require('crypto');

function makeObservation(opts) {
  const o = opts || {};
  if (!o.sensorId) throw new Error('makeObservation requires sensorId');
  return {
    id: o.id || `obs_${crypto.randomBytes(4).toString('hex')}`,
    sensorId: o.sensorId,
    agentId: o.agentId || null,
    target: o.target || null,
    data: o.data || {},
    uncertaintyBefore: numOr(o.uncertaintyBefore, null),
    uncertaintyAfter: numOr(o.uncertaintyAfter, null),
    informationGain: gainOf(o),
    at: new Date().toISOString()
  };
}

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function gainOf(o) {
  const before = Number(o.uncertaintyBefore);
  const after = Number(o.uncertaintyAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 0;
  return Math.max(0, Math.min(1, before - after));
}

module.exports = { makeObservation };
