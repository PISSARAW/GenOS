'use strict';

const crypto = require('node:crypto');

function requiredText(value, code, max = 256) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim().slice(0, max);
}

function uniqueText(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string')
    .map((value) => value.trim()).filter(Boolean))];
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function emptyState() {
  return { schema: 'genos.security-perception/v1', sensors: {}, baselines: {}, observations: [],
    hypotheses: [], investigations: [], calibration: {}, alerts: {}, incidents: {}, world: { entities: {}, relations: [] } };
}

function copyRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function copyList(value) {
  return Array.isArray(value) ? value : [];
}

function ensureState(state) {
  const empty = emptyState();
  const stored = state || {};
  const storedWorld = stored.world || {};
  return { ...empty, ...stored, sensors: copyRecord(stored.sensors), baselines: copyRecord(stored.baselines),
    calibration: copyRecord(stored.calibration), alerts: copyRecord(stored.alerts), incidents: copyRecord(stored.incidents),
    world: { ...empty.world, ...storedWorld, entities: copyRecord(storedWorld.entities),
      relations: copyList(storedWorld.relations) }, observations: copyList(stored.observations),
    hypotheses: copyList(stored.hypotheses), investigations: copyList(stored.investigations) };
}

module.exports = { requiredText, uniqueText, digest, clamp, emptyState, ensureState };
