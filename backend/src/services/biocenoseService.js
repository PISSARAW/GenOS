'use strict';

/**
 * @file biocenoseService.js
 * @description Biocenose collective coordination service: mission analysis,
 * role composition, and community-driven solver-reviewer orchestration.
 */

const biologicalModeService = require('./biologicalModeService');

function composeBiocenose(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Biocenose mission is required.'), {
      code: 'BIOCENOSE_MISSION_REQUIRED'
    });
  }
  const members = biologicalModeService.compose('biocenose', goal);
  return {
    mode: 'biocenose',
    mission: goal,
    evidenceThreshold: options.evidenceThreshold || 0.75,
    members
  };
}

function activateBiocenose(mission, context = {}) {
  const composition = composeBiocenose(mission, context);
  return {
    activated: true,
    communityId: `biocenose-${Date.now()}`,
    ...composition,
    status: 'ACTIVE',
    activatedAt: new Date().toISOString()
  };
}

module.exports = {
  composeBiocenose,
  activateBiocenose
};
