'use strict';

const biologicalModeService = require('./biologicalModeService');
const biocenoseService = require('./biocenoseService');
const syncytiumCoordinationService = require('./syncytiumCoordinationService');
const holobionteCoordinationService = require('./holobionteCoordinationService');
const metapopulationCoordinationService = require('./metapopulationCoordinationService');
const rhizomeCoordinationService = require('./rhizomeCoordinationService');
const biomeCoordinationService = require('./biomeCoordinationService');
const trinityService = require('./trinityService');
const aTeamService = require('./aTeamService');
const topologyWorkerKindService = require('./topologyWorkerKindService');

const MODE_ALIASES = Object.freeze({ ateam: 'a_team', holobiont: 'holobionte' });

function normalizeMode(mode) {
  const key = String(mode || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  return MODE_ALIASES[key] || key;
}

const COMPOSERS = Object.freeze({
  trinity: composeTrinity,
  a_team: composeATeam,
  biocenose: composeBiocenose,
  syncytium: composeSyncytium,
  holobionte: composeHolobionte,
  metapopulation: composeMetapopulation,
  rhizome: composeRhizome,
  biome: composeBiome
});

async function applyOrganization({ db, orchestratorId, organization, reason }) {
  if (!organization || !orchestratorId) return;
  const dynamicOrganization = require('./dynamicOrganizationService');
  await dynamicOrganization.changeOrganization(db, { orchestratorId, organization, reason, changedBy: orchestratorId });
}

async function composeMode(input = {}) {
  const context = { ...input, key: normalizeMode(input.mode) };
  if (context.key === 'axolotl' || context.key === 'plastique') return composeAxolotl(context);
  const composer = COMPOSERS[context.key];
  const composition = composer
    ? await composer(context)
    : { members: biologicalModeService.compose(context.key, context.mission) };
  return topologyWorkerKindService.applyTopologyWorkerKinds(context.key, composition);
}

function composeTrinity({ mission }) {
  return { members: trinityService.compose(mission) };
}

function composeATeam({ mission }) {
  const analysis = aTeamService.analyzeMission(mission);
  if (!analysis.recommended) {
    throw Object.assign(new Error('A-Team requires at least two detected competency domains.'), {
      code: 'A_TEAM_MULTIDISCIPLINARY_REQUIRED'
    });
  }
  const dependencies = Object.fromEntries(analysis.members.map((member) => [member.label, member.dependsOn]));
  return {
    members: aTeamService.compose({
      projectGoal: mission,
      subSystems: analysis.detectedDomains,
      assignedRoles: analysis.members.map((member) => member.role),
      modelTiers: analysis.members.map((member) => member.modelTier),
      dependencies
    })
  };
}

function composeBiocenose({ db, orchestratorId, mission, options = {} }) {
  return biocenoseService.prepareCommunity({ db, orchestratorId, mission, options });
}

async function composeSyncytium({ db, orchestratorId, mission }) {
  const session = await syncytiumCoordinationService.createSession(mission, { db });
  await applyOrganization({ db, orchestratorId, organization: session.organization, reason: 'Syncytium mode activation' });
  return session;
}

async function composeHolobionte({ db, orchestratorId, mission }) {
  const composition = holobionteCoordinationService.composeHolobiont(mission);
  await applyOrganization({ db, orchestratorId, organization: composition.organization, reason: 'Holobionte mode activation' });
  return composition;
}

async function composeMetapopulation({ db, orchestratorId, mission, options = {} }) {
  const composition = await metapopulationCoordinationService.createMetapopulationSession(mission, {
    ...options, db, orchestratorId
  });
  await applyOrganization({ db, orchestratorId, organization: composition.organization, reason: 'Metapopulation mode activation' });
  return composition;
}

async function composeRhizome({ db, orchestratorId, mission }) {
  const session = await rhizomeCoordinationService.composeRhizome(mission, { db });
  await applyOrganization({ db, orchestratorId, organization: session.organization, reason: 'Rhizome mode activation' });
  return session;
}

async function composeBiome({ db, orchestratorId, mission, options = {} }) {
  const composition = await biomeCoordinationService.composeBiome(mission, { ...options, db });
  await applyOrganization({ db, orchestratorId, organization: composition.organization, reason: 'Biome mode activation' });
  return composition;
}

function composeAxolotl({ orchestratorId, mission }) {
  const axolotlTopologyService = require('./axolotlTopologyService');
  const mode = axolotlTopologyService.getTopologyMode(orchestratorId);
  return {
    mode: mode.mode,
    plastique: mode.mode === 'plastique',
    members: biologicalModeService.compose('axolotl', mission),
    modeInfo: mode
  };
}

module.exports = { composeMode, normalizeMode };
