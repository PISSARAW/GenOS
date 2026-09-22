const SEARCH_PROCESS = {
  CONTINUE: 'CONTINUE',
  FORAGE: 'FORAGE',
  PLASTICITE: 'PLASTICITE',
  CLONAL_AFFINITY_SEARCH: 'CLONAL_AFFINITY_SEARCH',
  REPLAY_CAUSAL: 'REPLAY_CAUSAL',
  STRESS_HYPERMUTATION: 'STRESS_HYPERMUTATION',
  SPECIATION: 'SPECIATION',
  EVOLUTION: 'EVOLUTION'
};

function evolvePopulation(context) {
  const population = context.population || 1;
  const generations = Math.max(1, Math.floor(population * 0.3));
  const fitnessDelta = population > 1 ? 0.15 * generations : 0;
  return { generations, fitnessDelta };
}

function generatePhenotypeVariant(context) {
  const topologies = ['isolated', 'adversarial', 'swarm', 'pipeline'];
  const toolSets = [['grep', 'test', 'trace'], ['profiler', 'causal-replay', 'fuzz'], ['formal-verify', 'model-check']];
  const currentTopology = context.topology || 'isolated';
  const newTopology = topologies.find(t => t !== currentTopology) || topologies[0];
  const newTools = toolSets[Math.floor(Math.random() * toolSets.length)];
  return { topology: newTopology, tools: newTools, strategy: context.strategy || 'direct-debug' };
}

function createHypothesisVariants(context) {
  const base = context.baseHypothesis || 'Hypothèse de base';
  return [0, 1, 2, 3].map(i => ({ id: `v${i}`, statement: `${base} (variant ${i})`, mutation: `mut${i}` }));
}

function mutateSearchGenome(genome, radius) {
  const radiusMap = { minimal: 1, local: 2, medium: 3, structural: 4, radical: 5 };
  const numMutations = radiusMap[radius] || 3;
  const targets = ['hypothesis', 'strategy', 'tool', 'decomposition', 'topology', 'representation'];
  const mutations = [];
  for (let i = 0; i < numMutations; i++) {
    mutations.push({ target: targets[Math.floor(Math.random() * targets.length)], action: 'mutated' });
  }
  return { originalGenome: genome, mutations, newGenome: { ...genome, mutated: true, mutations } };
}

function createNiches(context) {
  const count = context.nicheCount || 3;
  const focuses = ['temporal', 'state', 'environment', 'causal', 'behavioral'];
  return Array.from({ length: count }, (_, i) => ({
    id: `niche_${i}`,
    focus: focuses[i % focuses.length],
    budget: 'shared',
    operators: [],
    memory: { negative_trails: true }
  }));
}

module.exports = {
  SEARCH_PROCESS,
  evolvePopulation,
  generatePhenotypeVariant,
  createHypothesisVariants,
  mutateSearchGenome,
  createNiches
};
