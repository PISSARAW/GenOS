'use strict';

const { getDatabase } = require('../db');
const { AdaptiveStateService } = require('./adaptiveStateService');
const gangliaBasals = require('./mcpBioTools/handlers/gangliaBasals');
const foraging = require('./foragingScoutHarvesterService');
const axolotlTopology = require('./axolotlTopologyService');
const axolotlRegeneration = require('./axolotlRegenerationService');
const plasticityRegulator = require('./development/plasticityRegulatorService');
const { registryBindings } = require('./mcpBioTools/registryBindings');

let adaptivePersister = null;
let adaptivePersisterPromise = null;

function getAdaptivePersister() {
  return adaptivePersister;
}

async function initializeAdaptivePersister(database) {
  if (adaptivePersister) return adaptivePersister;
  if (adaptivePersisterPromise) return adaptivePersisterPromise;

  adaptivePersisterPromise = (async () => {
    try {
      adaptivePersister = new AdaptiveStateService(database);

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
      await bindPlasticityRegulator(adaptivePersister);

      // Réhydrate et branche MCP biomimétiques
      await bindMcpBiomimicryRegistries(adaptivePersister);

      return adaptivePersister;
    } catch (error) {
      adaptivePersister = null;
      adaptivePersisterPromise = null;
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
      axolotlTopology.setStateStore(stored);
    }
    axolotlTopology.setAdaptivePersister(persister);
  } catch (_) {}
}

async function bindAxolotlRegeneration(persister) {
  try {
    const stored = await persister.restoreMap('axolotl_regeneration', 'sessions');
    if (stored && stored.size) {
      axolotlRegeneration.setStateStore(stored);
    }
    axolotlRegeneration.setAdaptivePersister(persister);
  } catch (_) {}
}

async function bindPlasticityRegulator(persister) {
  try {
    const stored = await persister.restoreMap('axolotl_plasticity', 'states');
    plasticityRegulator.setStateStore(stored);
    plasticityRegulator.setAdaptivePersister(persister);
  } catch (_) {
    plasticityRegulator.setAdaptivePersister(persister);
  }
}

async function bindMcpBiomimicryRegistries(persister) {
  for (const reg of registryBindings()) {
    const live = reg.mod[reg.liveKey];
    if (!(live instanceof Map)) throw new Error(`Missing biomimicry registry: ${reg.scope}/${reg.key}`);
    const stored = await persister.restoreMap(reg.scope, reg.key);
    if (stored.size) {
      live.clear();
      for (const [key, value] of stored) live.set(key, value);
    }
    persister.registerMcpBiomimicryRegistry(reg.scope, reg.key, live);
    persister.makePersistentMap(reg.scope, reg.key, live);
    if (reg.mod.setAdaptivePersister) reg.mod.setAdaptivePersister(persister);
  }
}

// Hook: opportuniste — on initialise au premier usage pour ne pas bloquer le boot
async function ensureAdaptivePersister(db) {
  if (!db) return ensureAdaptivePersister(await getDatabase());
  return initializeAdaptivePersister(db);
}

// Hook: appelé dans les handlers qui ont accès au db pour forcer la persistance
async function persistAdaptiveStateNow() {
  const persister = await ensureAdaptivePersister();
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
    axolotlRegeneration,
    plasticityRegulator
  }
};
