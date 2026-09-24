'use strict';

const DEFAULT_MAX_AGE_DAYS = 30;

function ageInDays(timestamp, now = Date.now()) {
  const parsed = Date.parse(timestamp || '');
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (now - parsed) / 86400000);
}

function assessFreshness(expertise, options = {}) {
  const maxAgeDays = Number(options.maxAgeDays) || DEFAULT_MAX_AGE_DAYS;
  const ageDays = ageInDays(expertise?.lastSuccess || expertise?.updatedAt, options.now);
  const fresh = ageDays !== null && ageDays <= maxAgeDays && Number(expertise?.evidenceCount) > 0;
  return { fresh, ageDays, maxAgeDays, evidenceCount: Number(expertise?.evidenceCount) || 0 };
}

module.exports = { DEFAULT_MAX_AGE_DAYS, ageInDays, assessFreshness };
