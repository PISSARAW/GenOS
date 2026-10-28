'use strict';

const { createHash } = require('node:crypto');

function missionStartFingerprint(mission) {
  try {
    const canonical = canonicalize(mission, new Set());
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  } catch (cause) {
    throw Object.assign(new Error('Mission start payload must be a finite JSON value.', { cause }), {
      code: 'INVALID_MISSION_START_PAYLOAD'
    });
  }
}

function canonicalize(value, ancestors) {
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new TypeError('Circular mission start payload.');
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry, nextAncestors));
  const canonical = {};
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (entry !== undefined && typeof entry !== 'function' && typeof entry !== 'symbol') {
      canonical[key] = canonicalize(entry, nextAncestors);
    }
  }
  return canonical;
}

function activeMissionConflict(agentId) {
  return Object.assign(new Error(`Agent '${agentId}' already has a different mission active.`), {
    code: 'AGENT_MISSION_ALREADY_RUNNING'
  });
}

module.exports = { missionStartFingerprint, activeMissionConflict };
