'use strict';

const { selectCuriousDomain } = require('./curiosityExplorerService');
const { generateContextualRepresentations } = require('./representationalMutationEngine');
const { generateExaptations } = require('./exaptationEngine');
const { selectCulturalTraits } = require('./culturalSelectionService');
const { createEnvironmentPopulation } = require('./environmentGeneratorService');

function createNCEConfig(options) {
  options = options || {};
  return {
    curiosity: { enabled: options.curiosity !== false, weights: options.curiosityWeights || {} },
    representationalMutation: { enabled: options.reprMutation !== false },
    exaptation: { enabled: options.exaptation !== false },
    playSandbox: { enabled: options.play !== false, budget: options.playBudget || 5 },
    phenotype: { enabled: options.phenotype !== false },
    envCoev: { enabled: options.envCoev !== false },
    culture: { enabled: options.culture !== false },
  };
}

async function safeExecute(fn) {
  try { return await fn(); } catch (e) { return null; }
}

async function applyCuriosity(mission, config) {
  if (!mission.explorationDomains) return [];
  return selectCuriousDomain(
    mission.explorationDomains,
    { availableTokens: mission.budget?.tokens || 1000 },
    { weights: config.curiosity.weights }
  );
}

async function applyRepresentationalMutation(mission, config, db) {
  if ((mission.knownConcepts || []).length < 2) return [];
  const result = await generateContextualRepresentations(
    { db },
    { problem: mission.prompt, domain: mission.domain, keywords: mission.keywords },
    { k: 1, representationTypes: ['hybrid', 'ecosystem'] }
  );
  return result.representations || [];
}

async function applyExaptation(mission, config, db) {
  const all = [];
  for (const cap of (mission.existingCapabilities || []).slice(0, 3)) {
    const result = await generateExaptations(cap, { db }, { limit: 3 });
    all.push(...(result.propositions || []));
  }
  return all;
}

async function applyEnvCoev(mission, config, db) {
  const pop = createEnvironmentPopulation(mission, { size: 3 });
  return pop.environments || [];
}

async function applyCulture(mission, config) {
  return selectCulturalTraits(mission.culturalTraits, {}, 3);
}

async function enhanceMissionWithNCE(mission, config, db) {
  config = config || createNCEConfig();
  const enhancements = { curiousDomains: [], representations: [], exaptations: [], environments: [], culturalTraits: [], phenotype: null };

  const c1 = await safeExecute(() => applyCuriosity(mission, config));
  if (c1) enhancements.curiousDomains = c1;

  const c2 = await safeExecute(() => applyRepresentationalMutation(mission, config, db));
  if (c2) enhancements.representations = c2;

  const c3 = await safeExecute(() => applyExaptation(mission, config, db));
  if (c3) enhancements.exaptations = c3;

  const c4 = await safeExecute(() => applyEnvCoev(mission, config, db));
  if (c4) enhancements.environments = c4;

  const c5 = await safeExecute(() => applyCulture(mission, config));
  if (c5) enhancements.culturalTraits = c5;

  return enhancements;
}

function buildPromptEnrichment(options) {
  const additions = [];
  const sections = [
    { data: options.curiousDomains, header: 'Domaines a explorer (curiosite)', limit: 3, extract: (d) => d.domainId || d },
    { data: options.exaptations, header: 'Exaptations disponibles', limit: 2, extract: (e) => e.questions ? e.questions[0] : JSON.stringify(e).slice(0, 80) },
    { data: options.representations, header: 'Representations alternatives', limit: 2, extract: (r) => r.description || r.name || JSON.stringify(r).slice(0, 80) },
    { data: options.culturalTraits, header: 'Traits culturels', limit: 3, extract: (t) => t.name || t.id || JSON.stringify(t).slice(0, 80) },
  ];

  for (const s of sections) {
    if (s.data && s.data.length > 0) {
      additions.push(`\n\n## ${s.header}\n${s.data.slice(0, s.limit).map(s.extract).join(s.header.includes('curiosite') ? ', ' : '\n')}`);
    }
  }

  return additions.join('');
}

function enhancePromptWithNCE(prompt, options) {
  options = options || {};
  const additions = buildPromptEnrichment(options);

  return {
    enhancedPrompt: additions.length > 0 ? prompt + additions : prompt,
    domain: options.domain,
    keywords: options.keywords || [],
    curiousDomains: options.curiousDomains || [],
    representations: options.representations || [],
    exaptations: options.exaptations || [],
    culturalTraits: options.culturalTraits || [],
    explorationDomains: options.explorationDomains || [],
  };
}

async function createPlaySessionForMission(mission, opts) {
  opts = opts || {};
  const { createPlaySession, runPlaySession, generateCombinatorialInputs } = require('./playService');
  const tools = opts.tools || ['genos_test', 'genos_patch', 'genos_research'];
  const contexts = opts.contexts || opts.environments || mission.explorationDomains || ['general'];
  const inputs = generateCombinatorialInputs(tools, contexts);
  return runPlaySession(opts.agentId || 'mission_agent', {
    inputs: inputs.slice(0, opts.budget || 5),
    options: { requireSandbox: true, timeoutMs: opts.timeoutMs || 30000 },
  });
}

module.exports = {
  createNCEConfig,
  enhanceMissionWithNCE,
  enhancePromptWithNCE,
  createPlaySessionForMission,
};
