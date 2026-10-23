'use strict';

const SOURCE = 'capabilityAccessMatrix.operationalTopologyCapabilities';

function resolveTopologyCapabilityInventory(mission = {}, plan = {}) {
  const declared = mission.topologyCapabilityInventory?.available
    ?? plan.topologyCapabilityInventory?.available
    ?? mission.missionCapabilityPlan?.availableTopologyCapabilities;
  if (Array.isArray(declared)) {
    return { available: [...new Set(declared)], source: 'mission-declaration', verified: false };
  }
  return {
    available: require('../capabilityAccessMatrix').operationalTopologyCapabilities(),
    source: SOURCE,
    verified: true
  };
}

module.exports = { SOURCE, resolveTopologyCapabilityInventory };
