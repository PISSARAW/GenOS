'use strict';

/**
 * @file holobionteService.js
 * @description Holobionte integrated collective service: mission analysis,
 * host authority governance, and symbiotic agent orchestration.
 */

const biologicalModeService = require('./biologicalModeService');

function composeHolobionte(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Holobionte mission is required.'), {
      code: 'HOLOBIONTE_MISSION_REQUIRED'
    });
  }
  const members = biologicalModeService.compose('holobionte', goal);
  return {
    mode: 'holobionte',
    mission: goal,
    hostAuthority: options.hostAuthority || 'host_orchestrator',
    members
  };
}

function activateHolobionte(mission, context = {}) {
  const composition = composeHolobionte(mission, context);
  return {
    activated: true,
    holobiontId: `holobionte-${Date.now()}`,
    ...composition,
    status: 'ACTIVE',
    activatedAt: new Date().toISOString()
  };
}

module.exports = {
  composeHolobionte,
  activateHolobionte
};
