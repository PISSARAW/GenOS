'use strict';

function assess({ domain, field, path, telemetry = {}, nowMs = Date.now() }) {
  const maxStalenessMs = field?.maxStalenessMs ?? domain.stalenessBudgets?.[path] ?? domain.maxStalenessMs ?? null;
  const lastSeenMs = Number(telemetry.lastSeenMs?.[domain.domainId]);
  const ageMs = Number.isFinite(lastSeenMs) ? Math.max(0, nowMs - lastSeenMs) : null;
  const stale = maxStalenessMs !== null && ageMs !== null && ageMs > maxStalenessMs;
  return { maxStalenessMs, ageMs, stale, status: ageMs === null ? 'UNKNOWN' : stale ? 'STALE' : 'FRESH' };
}

module.exports = { assess };
