const MODULE_NAMES = ['genome', 'variants', 'patches', 'replay', 'negative', 'population', 'culture'];

function captureModules(state) {
  const m = state.actuator.modules;
  return {
    genome: { genome: m.searchGenome.genome }, variants: m.affinityVariants || [],
    patches: [...m.patchService.patches], replay: [...m.causalReplay.replayHistory],
    negative: [...m.negativeMemory.trails],
    population: { population: m.evolutionEngine.population, generation: m.evolutionEngine.generation,
      generationHistory: m.evolutionEngine.generationHistory },
    culture: { plasmids: [...m.cultureService.plasmids], transmissions: m.cultureService.transmissions,
      received: [...m.cultureService.received] }
  };
}

function applyModules(state, saved) {
  const m = state.actuator.modules;
  if (saved.genome) m.searchGenome.genome = saved.genome.genome;
  m.affinityVariants = saved.variants || [];
  if (saved.patches) m.patchService.patches = new Map(saved.patches);
  if (saved.replay) m.causalReplay.replayHistory = new Map(saved.replay);
  if (saved.negative) m.negativeMemory.trails = new Map(saved.negative);
  applyPopulation(m, saved.population);
  applyCulture(m, saved.culture);
  m.negativeMemory.evaporate();
}

function applyPopulation(m, saved) {
  if (!saved) return;
  m.evolutionEngine.population = saved.population;
  m.evolutionEngine.generation = saved.generation;
  m.evolutionEngine.generationHistory = saved.generationHistory;
  m.searchGenome.population = m.evolutionEngine.population;
}

function applyCulture(m, saved) {
  if (!saved) return;
  m.cultureService.plasmids = new Map(saved.plasmids);
  m.cultureService.transmissions = saved.transmissions;
  m.cultureService.received = new Map(saved.received || []);
}

async function restoreModuleStates(agentId, state) {
  const values = await Promise.all(MODULE_NAMES.map(name => state.persistence.loadModuleState(agentId, name)));
  applyModules(state, Object.fromEntries(MODULE_NAMES.map((name, index) => [name, values[index]])));
}

async function persistModuleStates(agentId, state) {
  await state.persistence.saveModuleStates(agentId, captureModules(state));
}

module.exports = { restoreModuleStates, persistModuleStates, captureModules, applyModules };
