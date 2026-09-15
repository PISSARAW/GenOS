'use strict';

/**
 * @file biologicalTopologyService.js
 * @description Single dispatch point for biological-mode composition. Modes
 * with a dedicated coordination service (Biocenose, Syncytium) get their real
 * runtime wiring and organization; the remaining modes fall back to role
 * composition.
 */
const biologicalModeService = require('./biologicalModeService');
const axolotlTopologyService = require('./axolotlTopologyService');
const biocenoseService = require('./biocenoseService');
const syncytiumCoordinationService = require('./syncytiumCoordinationService');
const holobionteCoordinationService = require('./holobionteCoordinationService');
const metapopulationCoordinationService = require('./metapopulationCoordinationService');
const rhizomeCoordinationService = require('./rhizomeCoordinationService');
const biomeCoordinationService = require('./biomeCoordinationService');

async function applyOrganization({ db, orchestratorId, organization, reason }) {
  if (!organization) return;
  const dynamicOrganization = require('./dynamicOrganizationService');
  await dynamicOrganization.changeOrganization(db, { orchestratorId, organization, reason, changedBy: orchestratorId }).catch(() => {});
}

async function composeMode(input = {}) {
  const { db, orchestratorId, mode, mission } = input;
  const key = String(mode || '').trim().toLowerCase();
  if (key === 'biocenose') return biocenoseService.prepareCommunity(db, orchestratorId, mission);
  if (key === 'syncytium') {
    const session = await syncytiumCoordinationService.createSession(mission, { db });
    await applyOrganization({ db, orchestratorId, organization: session.organization, reason: 'Syncytium mode activation' });
    return session;
  }
  if (key === 'holobionte') {
    const composition = holobionteCoordinationService.composeHolobiont(mission);
    await applyOrganization({ db, orchestratorId, organization: composition.organization, reason: 'Holobionte mode activation' });
    return composition;
  }
  if (key === 'metapopulation') {
    const composition = metapopulationCoordinationService.composeMetapopulation(mission);
    await applyOrganization({ db, orchestratorId, organization: composition.organization, reason: 'Metapopulation mode activation' });
    return composition;
  }
  if (key === 'rhizome') {
    const session = await rhizomeCoordinationService.composeRhizome(mission, { db });
    await applyOrganization({ db, orchestratorId, organization: session.organization, reason: 'Rhizome mode activation' });
    return session;
  }
  if (key === 'biome') {
    const composition = biomeCoordinationService.composeBiome(mission);
    await applyOrganization({ db, orchestratorId, organization: composition.organization, reason: 'Biome mode activation' });
    return composition;
  }
  if (key === 'axolotl' || key === 'plastique') {
    const mode = axolotlTopologyService.getTopologyMode(orchestratorId);
    return {
      mode: mode.mode,
      plastique: mode.mode === 'plastique',
      members: biologicalModeService.compose('axolotl', mission),
      modeInfo: mode
    };
  }
  return { members: biologicalModeService.compose(key, mission) };
}

module.exports = { composeMode };
