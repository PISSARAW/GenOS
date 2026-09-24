'use strict';

function halfLifeMs(entry, fallback) {
  const configured = Number(entry.halfLifeMs);
  if (Number.isFinite(configured) && configured > 0) return configured;
  const kind = entry.kind;
  const confidence = Number(entry.confidence) || 0;
  if (['TEMPORARY_OUTAGE', 'HIGH_LATENCY'].includes(kind)) return Math.max(1000, fallback / 4);
  if (['VERIFIED_RESULT', 'ROUTE_SUCCESS'].includes(kind)) return fallback * (1 + confidence);
  if (['SECURITY_RISK', 'SECURITY_FAILURE'].includes(kind)) return fallback * 4;
  return fallback;
}

function decay(entry, now, fallback) {
  const elapsed = Math.max(0, now - entry.lastUpdatedMs);
  return Number((entry.intensity * Math.pow(0.5, elapsed / halfLifeMs(entry, fallback))).toFixed(4));
}

function evaporate(matrix, now = Date.now()) {
  for (const [marker, entry] of matrix.trails.entries()) {
    matrix.trails.set(marker, { ...entry, intensity: decay(entry, now, matrix.halfLifeMs), lastUpdatedMs: now });
  }
  return [...matrix.trails.entries()].map(([marker, trail]) => ({ marker, intensity: trail.intensity }));
}

module.exports = { halfLifeMs, decay, evaporate };
