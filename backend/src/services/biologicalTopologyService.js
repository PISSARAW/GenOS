'use strict';

/**
 * @file biologicalTopologyService.js
 * @description Single dispatch point for biological-mode composition. Modes
 * with a dedicated coordination service (Biocenose, Syncytium) get their real
 * runtime wiring and organization; the remaining modes fall back to role
 * composition.
 */
const biologicalModeService = require('./biologicalModeService');
const biocenoseService = require('./biocenoseService');
const syncytiumCoordinationService = require('./syncytiumCoordinationService');

async function applyOrganization(db, orchestratorId, organization, reason) {
  if (!organization) return;
  const dynamicOrganization = require('./dynamicOrganizationService');
  await dynamicOrganization.changeOrganization(db, { orchestratorId, organization, reason, changedBy: orchestratorId }).catch(() => {});
}

async function composeMode(input = {}) {
  const { db, orchestratorId, mode, mission } = input;
  const key = String(mode || '').trim().toLowerCase();
  if (key === 'biocenose') return biocenoseService.prepareCommunity(db, orchestratorId, mission);
  if (key === 'syncytium') {
    const session = syncytiumCoordinationService.createSession(mission);
    await applyOrganization(db, orchestratorId, session.organization, 'Syncytium mode activation');
    return session;
  }
  return { members: biologicalModeService.compose(key, mission) };
}

module.exports = { composeMode };
