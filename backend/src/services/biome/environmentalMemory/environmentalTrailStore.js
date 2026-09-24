'use strict';

const biofilm = require('../../biofilmMatrixService');
const trailDecayService = require('./trailDecayService');

function deposit(matrix, input = {}) {
  const location = String(input.location || '').trim();
  if (!location) throw new Error('An environmental trail location is required.');
  const trail = {
    key: input.key || `trail:${location}:${Date.now()}`,
    kind: input.kind || 'environmental_trail', location,
    sourcePopulation: input.sourcePopulation || null,
    intensity: clamp01(input.intensity, 1), confidence: clamp01(input.confidence, 0.5),
    attractant: clamp01(input.attractant, 0), repellent: clamp01(input.repellent, 0),
    yield: Math.max(0, Number(input.yield) || 0), risk: clamp01(input.risk, 0),
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.filter(Boolean) : [],
    createdAt: Number(input.createdAt) || Date.now(), ttl: Math.max(1, Number(input.ttl) || 86400000),
    decayRate: clamp01(input.decayRate, 0.5)
  };
  return biofilm.deposit(matrix, trail);
}

function read(matrix, location, now = Date.now()) {
  return biofilm.read(matrix, { kind: 'environmental_trail' })
    .filter((trail) => !location || trail.location === location)
    .map((trail) => trailDecayService.decay(trail, now)).filter((trail) => !trail.expired);
}

function clamp01(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

module.exports = { deposit, read };
