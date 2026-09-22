'use strict';

/**
 * Definition factory for philosophical concepts.
 *
 * Every concept record produced by this factory carries the operational
 * metadata that the GenOS philosophical constitution requires:
 *   role                 — core | operational | analogy | lens | speculative
 *   runtimeAuthority     — whether the concept may drive runtime decisions
 *   falsifiable          — whether the concept exposes conditions under which it could be refuted
 *   scope                — descriptive boundary of what the concept is intended to cover
 *   knownLimits          — explicit limitations that must travel with the concept
 *   historicalConfidence — 0..1 confidence in the historical/textual basis of the concept
 *
 * The factory does not invent values for those fields; callers (concept
 * definitions, fixtures, migration code) supply them. When a field is
 * absent the factory leaves it undefined rather than inventing a default,
 * because an absent field is visible to validators and tests.
 */

function C({
  id,
  label,
  domain,
  school,
  status,
  service = null,
  serviceMaturity = null,
  role = null,
  runtimeAuthority = null,
  falsifiable = null,
  scope = null,
  knownLimits = null,
  historicalConfidence = null,
  metadata = {}
}) {
  return {
    id,
    label,
    domain,
    school,
    status,
    service,
    role,
    runtimeAuthority,
    falsifiable,
    scope,
    knownLimits,
    historicalConfidence,
    ...(serviceMaturity ? { serviceMaturity } : {}),
    ...metadata,
  };
}

module.exports = { C };
