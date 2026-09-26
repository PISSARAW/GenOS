'use strict';

const biofilm = require('../../biofilmMatrixService');

function advance({ ecology, state, matrix, input }) {
  const season = Math.max((state.seasons || []).at(-1)?.season || 0, Number(input.season) || 0);
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const retentionMs = Number.isFinite(input.retentionMs) ? Math.max(0, input.retentionMs) : 90 * 86400000;
  const decayed = expiredEntries(matrix, now, retentionMs);
  const expiredKeys = new Set(decayed.map((entry) => entry.key));
  for (const key of expiredKeys) matrix.entries.delete(key);
  matrix.history = matrix.history.filter((entry) => !expiredKeys.has(entry.key));
  const seasonRecord = { season, missionId: input.missionId || ecology.missionId, tick: ecology.tick,
    resourceState: structuredClone(ecology.resourcePool), populationIds: ecology.populations.map((item) => item.populationId),
    nicheIds: ecology.niches.map((item) => item.nicheId), migrations: strings(input.migrations),
    decayCount: decayed.length, recordedAt: now };
  const seasons = [...(state.seasons || []), seasonRecord].slice(-500);
  ecology.ecologicalState.longitudinalMemory = seasons;
  return { state: { ...state, seasons }, decision: { season: seasonRecord, expiredEntries: decayed.length },
    action: { type: 'PERSISTENT_SEASON_COMMITTED', status: 'applied', season, expiredEntries: decayed.length } };
}

function expiredEntries(matrix, now, retentionMs) {
  return biofilm.read(matrix).filter((entry) => isExpired(entry, now, retentionMs));
}

function isExpired(entry, now, retentionMs) {
  const protectedKinds = ['resource_allocation', 'environment_version'];
  return Number.isFinite(entry.depositedAt) && now - entry.depositedAt > retentionMs
    && !protectedKinds.includes(entry.kind);
}

function strings(value) { return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : []; }

module.exports = { advance };
