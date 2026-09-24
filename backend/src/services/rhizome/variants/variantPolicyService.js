'use strict';

const PROFILES = Object.freeze({
  exploratory: Object.freeze({ routing: { maxHops: 6 }, growth: { threshold: 0 }, pruning: { enabled: false }, resilience: { alternatives: 2 }, stop: { stableTicks: 3 } }),
  routing: Object.freeze({ routing: { maxHops: 12 }, growth: { threshold: 0.2 }, pruning: { enabled: true }, resilience: { alternatives: 2 }, stop: { stableTicks: 2 } }),
  growth: Object.freeze({ routing: { maxHops: 8 }, growth: { threshold: 0 }, pruning: { enabled: false }, resilience: { alternatives: 2 }, stop: { stableTicks: 4 } }),
  resilient: Object.freeze({ routing: { maxHops: 12 }, growth: { threshold: 0.15 }, pruning: { enabled: true }, resilience: { alternatives: 4 }, stop: { stableTicks: 3 } }),
  sparse: Object.freeze({ routing: { maxHops: 5 }, growth: { threshold: 0.5 }, pruning: { enabled: true }, resilience: { alternatives: 1 }, stop: { stableTicks: 2 } })
});

function resolve(name = 'routing') {
  const profile = PROFILES[String(name).toLowerCase()];
  if (!profile) throw Object.assign(new Error(`Unknown Rhizome variant '${name}'.`), { code: 'RHIZOME_VARIANT_UNKNOWN' });
  return { name: String(name).toLowerCase(), ...structuredClone(profile) };
}

function list() {
  return Object.keys(PROFILES);
}

function analyzeFit(input = {}) {
  if (input.routeFailures > 0) return { variant: 'resilient', reason: 'ROUTE_FAILURES' };
  if (input.budgetTight === true) return { variant: 'sparse', reason: 'BUDGET_CONSTRAINT' };
  if (input.unknownCapabilities > 0) return { variant: 'exploratory', reason: 'CAPABILITY_UNCERTAINTY' };
  return { variant: 'routing', reason: 'STABLE_ROUTING_NEED' };
}

module.exports = { resolve, list, analyzeFit };
