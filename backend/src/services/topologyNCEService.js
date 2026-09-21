'use strict';

const nceIntegration = require('./nceIntegrationService');

const TOPOLOGY_SIGNALS = {
  worker: { curiosity: true, exaptation: true, play: true, representationalMutation: false, phenotype: false, culture: false },
  team: { curiosity: true, exaptation: true, play: false, representationalMutation: true, phenotype: false, culture: true },
  trinity: { curiosity: true, exaptation: true, play: true, representationalMutation: true, phenotype: true, culture: true },
  biological: { curiosity: true, exaptation: true, play: false, representationalMutation: false, phenotype: true, culture: true },
};

function getSignals(topology) {
  return TOPOLOGY_SIGNALS[topology] || TOPOLOGY_SIGNALS.worker;
}

function addCuriositySection(additions, signals, options) {
  if (!signals.curiosity) return;
  if (!options.curiousDomains || options.curiousDomains.length === 0) return;
  const top = options.curiousDomains.slice(0, 3).map((d) => d.domainId || d).join(', ');
  if (top) additions.push(`\n\n## Domaines a explorer (curiosite)\n${top}`);
}

function addExaptationSection(additions, signals, options) {
  if (!signals.exaptation) return;
  if (!options.exaptations || options.exaptations.length === 0) return;
  additions.push(`\n\n## Exaptations disponibles\n${options.exaptations.slice(0, 2).map((e) => `- ${e.questions ? e.questions[0] : JSON.stringify(e).slice(0, 80)}`).join('\n')}`);
}

function addRepresentationSection(additions, signals, options) {
  if (!signals.representationalMutation) return;
  if (!options.representations || options.representations.length === 0) return;
  additions.push(`\n\n## Representations alternatives\n${options.representations.slice(0, 2).map((r) => `- ${r.description || r.name || JSON.stringify(r).slice(0, 80)}`).join('\n')}`);
}

function addCultureSection(additions, signals, options) {
  if (!signals.culture) return;
  if (!options.culturalTraits || options.culturalTraits.length === 0) return;
  additions.push(`\n\n## Traits culturels\n${options.culturalTraits.slice(0, 3).map((t) => `- ${t.name || t.id || JSON.stringify(t).slice(0, 80)}`).join('\n')}`);
}

function enrichWorkerPromptSync(prompt, options) {
  options = options || {};
  const signals = getSignals(options.topology || 'worker');
  const additions = [];

  addCuriositySection(additions, signals, options);
  addExaptationSection(additions, signals, options);
  addRepresentationSection(additions, signals, options);
  addCultureSection(additions, signals, options);

  return prompt + additions.join('');
}

async function computeNCEForTopology(task, options) {
  options = options || {};
  const enhancements = nceIntegration.enhancePromptWithNCE(task, options);

  return {
    topology: options.topology || 'worker',
    domain: enhancements.domain,
    keywords: enhancements.keywords,
    curiousDomains: enhancements.curiousDomains,
    representations: enhancements.representations,
    exaptations: enhancements.exaptations,
    culturalTraits: enhancements.culturalTraits,
    explorationDomains: enhancements.explorationDomains,
  };
}

module.exports = {
  TOPOLOGY_SIGNALS,
  enrichWorkerPromptSync,
  computeNCEForTopology,
};
