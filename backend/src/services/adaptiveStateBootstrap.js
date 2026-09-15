'use strict';

const { getDatabase } = require('../db');
const { AdaptiveStateService } = require('./adaptiveStateService');
const gangliaBasals = require('./mcpBioTools/handlers/gangliaBasals');
const foraging = require('./foragingScoutHarvesterService');
const axolotlTopology = require('./axolotlTopologyService');
const axolotlRegeneration = require('./axolotlRegenerationService');
const mcpBioHandlers = require('../mcpBioTools/handlers');

let adaptivePersister = null;
let adaptivePersisterPromise = null;

async function getAdaptivePersister() {
  if (adaptivePersister) return adaptivePersister;
  if (adaptivePersisterPromise) return adaptivePersisterPromise;

  adaptivePersisterPromise = (async () => {
    try {
      const db = await getDatabase();
      adaptivePersister = new AdaptiveStateService(db);

      // Réhydrate ganglia depuis storage
      await adaptivePersister.resumeGangliaFromStorage();

      // Branche ganglia
      gangliaBasals.setAdaptivePersister(adaptivePersister);

      // Réhydrate et branche foraging
      await bindForaging(adaptivePersister);

      // Réhydrate et branche axolotl topology
      await bindAxolotlTopology(adaptivePersister);

      // Réhydrate et branche axolotl regeneration
      await bindAxolotlRegeneration(adaptivePersister);

      // Réhydrate et branche MCP biomimétiques
      await bindMcpBiomimicryRegistries(adaptivePersister);

      return adaptivePersister;
    } catch (error) {
      // L'adoption adaptive est best-effort : en cas d'échec, ganglia
      // continue de fonctionner en mémoire sans persistance.
      console.warn('[adaptive-state] Failed to initialize adaptive persister:', error.message);
      return null;
    }
  })();

  return adaptivePersisterPromise;
}

async function bindForaging(persister) {
  try {
    const stored = await persister.restoreMap('foraging', 'pheromones');
    if (stored && stored.size) {
      foraging.pheromoneLedger = stored;
    }
    foraging.setAdaptivePersister(persister);
  } catch (_) {}
}

async function bindAxolotlTopology(persister) {
  try {
    const stored = await persister.restoreMap('axolotl_topology', 'modes');
    if (stored && stored.size) {
      axolotlTopology.topologyModes = stored;
    }
    axolotlTopology.setAdaptivePersister(persister);
  } catch (_) {}
}

async function bindAxolotlRegeneration(persister) {
  try {
    const stored = await persister.restoreMap('axolotl_regeneration', 'sessions');
    if (stored && stored.size) {
      axolotlRegeneration.regenerationSessions = stored;
    }
    axolotlRegeneration.setAdaptivePersister(persister);
  } catch (_) {}
}

async function bindMcpBiomimicryRegistries(persister) {
  const registries = [
    { name: 'agrobacterium', mod: mcpBioHandlers.handleAgrobacteriumTdnaHijack, registryKey: 'agrobacteriumRegistry' },
    { name: 'aneuploidy', mod: mcpBioHandlers.handleAneuploidy, registryKey: 'aneuploidyRegistry' },
    { name: 'chromosomal_deletion', mod: mcpBioHandlers.handleChromosomalDeletion, registryKey: 'chromosomalDeletionRegistry' },
    { name: 'chimeric_merge', mod: mcpBioHandlers.handleChimericMerge, registryKey: 'chimericRegistry' },
    { name: 'conjoined_twin', mod: mcpBioHandlers.handleConjoinedTwinBind, registryKey: 'conjoinedTwinRegistry' },
    { name: 'consciousness_transfer', mod: mcpBioHandlers.handleConsciousnessTransfer, registryKey: 'consciousnessRegistry' },
    { name: 'affordances_scanner', mod: mcpBioHandlers.handleAffordancesScanner, registryKey: 'affordancesLedger' }
  ];

  for (const reg of registries) {
    try {
      const mod = reg.mod;
      if (!mod || !mod[reg.registryKey]) continue;
      const stored = await persister.restoreMap(`mcp_bio::${reg.name}`, reg.registryKey);
      if (stored && stored.size) {
        mod[reg.registryKey] = stored;
      }
      mod.setAdaptivePersister && mod.setAdaptivePersister(persister);
    } catch (_) {}
  }
}

// Hook: opportuniste — on initialise au premier usage pour ne pas bloquer le boot
async function ensureAdaptivePersister() {
  return getAdaptivePersister();
}

// Hook: appelé dans les handlers qui ont accès au db pour forcer la persistance
async function persistAdaptiveStateNow() {
  const persister = await getAdaptivePersister();
  if (!persister) return;
  // La persistance est déjà faite en temps réel par les handlers, mais on
  // peut forcer une synchro complète si nécessaire.
  return persister;
}

module.exports = {
  getAdaptivePersister,
  ensureAdaptivePersister,
  persistAdaptiveStateNow,
  // Régistre les handlers qui doivent être notifiés d'un changement de persister
  _registry: {
    gangliaBasals,
    foraging,
    axolotlTopology,
    axolotlRegeneration
  }
};
