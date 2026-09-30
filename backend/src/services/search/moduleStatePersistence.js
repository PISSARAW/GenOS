const MODULE_NAMES = ['genome', 'variants', 'patches', 'replay', 'negative', 'population', 'culture'];

async function restoreModuleStates(agentId, state) {
  const modules = state.actuator.modules;
  const values = await Promise.all(MODULE_NAMES.map(name => state.persistence.loadModuleState(agentId, name)));
  const saved = Object.fromEntries(MODULE_NAMES.map((name, index) => [name, values[index]]));
  restoreGenome(saved.genome, modules, state.actuator);
  modules.affinityVariants = saved.variants || [];
  if (saved.patches) modules.patchService.patches = new Map(saved.patches);
  if (saved.replay) modules.causalReplay.replayHistory = new Map(saved.replay);
  if (saved.negative) modules.negativeMemory.trails = new Map(saved.negative);
  restorePopulation(saved.population, modules, state.actuator);
  restoreCulture(saved.culture, modules);
}

function restoreGenome(saved, modules, actuator) {
  if (!saved?.genome) return;
  modules.searchGenome.genome = saved.genome;
  actuator.searchGenome.genome = saved.genome;
}

function restorePopulation(saved, modules, actuator) {
  if (!saved) return;
  modules.evolutionEngine.population = saved.population || [];
  modules.evolutionEngine.generation = saved.generation || 0;
  modules.evolutionEngine.generationHistory = saved.generationHistory || [];
  actuator.searchGenome.population = modules.evolutionEngine.population;
}

function restoreCulture(saved, modules) {
  if (!saved) return;
  modules.cultureService.plasmids = new Map(saved.plasmids || []);
  modules.cultureService.transmissions = saved.transmissions || [];
}

async function persistModuleStates(agentId, state) {
  const modules = state.actuator.modules;
  const values = {
    genome: { genome: modules.searchGenome.genome }, variants: modules.affinityVariants || [],
    patches: [...modules.patchService.patches], replay: [...modules.causalReplay.replayHistory],
    negative: [...modules.negativeMemory.trails],
    population: { population: modules.evolutionEngine.population, generation: modules.evolutionEngine.generation,
      generationHistory: modules.evolutionEngine.generationHistory },
    culture: { plasmids: [...modules.cultureService.plasmids], transmissions: modules.cultureService.transmissions }
  };
  for (const [name, value] of Object.entries(values)) await state.persistence.saveModuleState(agentId, name, value);
}

module.exports = { restoreModuleStates, persistModuleStates };
