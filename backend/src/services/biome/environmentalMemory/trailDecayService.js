'use strict';

function decay(trail, now = Date.now()) {
  const age = Math.max(0, now - Number(trail.createdAt || 0));
  const ttl = Math.max(1, Number(trail.ttl) || 86400000);
  const rate = clamp01(Number(trail.decayRate), 0.5);
  const remaining = Math.max(0, 1 - age / ttl);
  return { ...trail, intensity: Number((Number(trail.intensity || 0) * Math.pow(remaining, rate)).toFixed(6)),
    expired: age >= ttl };
}

function clamp01(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

module.exports = { decay };
