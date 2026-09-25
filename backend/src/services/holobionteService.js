'use strict';

/**
 * @file holobionteService.js
 * @description Holobionte integrated collective service: mission analysis,
 * host authority governance, and symbiotic agent orchestration.
 */

const biologicalModeService = require('./biologicalModeService');
const variants = require('./holobionte/variants');

function composeHolobionte(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Holobionte mission is required.'), {
      code: 'HOLOBIONTE_MISSION_REQUIRED'
    });
  }
  const fitContext = {
    immunePlaneAvailable: true,
    successionAvailable: true,
    ...(options.variantCapabilities || {}),
    ...options
  };
  const selected = variants.selectForMission(goal, fitContext);
  const policy = selected.policy;
  const members = biologicalModeService.compose('holobionte', goal);
  return {
    mode: 'holobionte',
    mission: goal,
    hostAuthority: options.hostAuthority || 'host_orchestrator',
    members,
    variant: policy.name,
    variantPolicy: {
      host: policy.configureHost(), admission: policy.configureAdmission(),
      resources: policy.configureResources(), immune: policy.configureImmunePolicy(),
      transmission: policy.configureTransmission(), succession: policy.configureSuccession(),
      stopConditions: policy.configureStopConditions(), placement: policy.configurePlacement(),
      memory: policy.configureMemory(), competition: policy.configureCompetition(),
      tool: policy.configureTool(), synchronization: policy.configureSynchronization()
    },
    variantSelection: selected.receipt
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
