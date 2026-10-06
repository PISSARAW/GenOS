'use strict';

function allocate(capacities, niches, garageCapacity) {
  if (!Number.isSafeInteger(garageCapacity) || garageCapacity < 0) {
    throw Object.assign(new Error('Garage capacity must be a non-negative safe integer.'), { code: 'BIOME_GARAGE_CAPACITY_INVALID' });
  }
  const known = new Map(niches.map(niche => [niche.nicheId, niche]));
  const entries = capacities.map(entry => prepare(entry, known.get(entry.nicheId), garageCapacity))
    .sort((a, b) => b.score - a.score || a.nicheId.localeCompare(b.nicheId));
  let remaining = garageCapacity;
  for (const entry of entries) {
    const grant = Math.min(remaining, entry.ceiling, entry.occupancy > 0 ? 1 : 0);
    entry.capacity += grant;
    remaining -= grant;
  }
  for (const entry of entries) {
    const grant = Math.min(remaining, Math.max(0, Math.min(entry.occupancy, entry.ceiling) - entry.capacity));
    entry.capacity += grant;
    remaining -= grant;
  }
  grow(entries, remaining);
  return entries.map(({ ceiling, occupancy, ...entry }) => entry);
}

function prepare(entry, niche, garageCapacity) {
  return { ...entry, score: niche?.opportunityScore || 0, occupancy: niche?.occupancy || 0,
    ceiling: Math.min(garageCapacity, entry.localCapacity ?? garageCapacity), capacity: 0, garageCapacity };
}

function grow(entries, available) {
  let remaining = available;
  for (let round = 0; round <= entries.length && remaining > 0; round += 1) {
    const active = entries.filter(entry => entry.capacity < entry.ceiling);
    if (!active.length) return;
    const share = Math.max(1, Math.floor(remaining / active.length));
    for (const entry of active) {
      const grant = Math.min(remaining, share, entry.ceiling - entry.capacity);
      entry.capacity += grant;
      remaining -= grant;
    }
  }
}

module.exports = { allocate };
