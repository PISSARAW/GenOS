'use strict';

const { hasResult } = require('./nceIntegrationService');

function makeSection(data, cfg) {
  if (!data || data.length === 0) return '';
  const items = data.slice(0, cfg.limit).map(cfg.extract).filter(Boolean);
  if (items.length === 0) return '';
  return `\n\n## ${cfg.header}\n${items.join(cfg.sep)}`;
}

const CURIOSITY_CFG = { header: 'Domaines a explorer (curiosite)', limit: 3, extract: (d) => d.domainId || d, sep: ', ' };
const REPR_CFG = { header: 'Representations alternatives', limit: 3, extract: (r) => `- ${r.description || r.name || JSON.stringify(r).slice(0, 100)}`, sep: '\n' };
const EXAPT_CFG = { header: 'Exaptations', limit: 3, extract: (x) => `- ${x.questions ? x.questions[0] : JSON.stringify(x).slice(0, 100)}`, sep: '\n' };
const CULT_CFG = { header: 'Traits culturels', limit: 3, extract: (t) => `- ${t.name || t.id || JSON.stringify(t).slice(0, 100)}`, sep: '\n' };

function buildCuriosity(e) {
  if (!hasResult(e.curiosity?.ranking)) return '';
  return makeSection(e.curiosity.ranking, CURIOSITY_CFG);
}

function buildRepresentations(e) {
  if (!hasResult(e.representations)) return '';
  return makeSection(e.representations, REPR_CFG);
}

function buildExaptations(e) {
  if (!hasResult(e.exaptations)) return '';
  return makeSection(e.exaptations, EXAPT_CFG);
}

function buildCulture(e) {
  if (!hasResult(e.culturalTraits)) return '';
  return makeSection(e.culturalTraits, CULT_CFG);
}

function buildPromptEnrichment(enhancements) {
  return buildCuriosity(enhancements) + buildRepresentations(enhancements) + buildExaptations(enhancements) + buildCulture(enhancements);
}

function pushSection(additions, data, cfg) {
  const section = makeSection(data, cfg);
  if (section) additions.push(section);
}

function enhancePromptWithNCE(prompt, options) {
  options = options || {};
  const signals = options.signals || {};
  const additions = [];
  
  // TOPOLOGY_SIGNALS contrôle quels moteurs sont actifs par topologie
  if (signals.curiosity !== false) {
    pushSection(additions, options.curiosity?.ranking, CURIOSITY_CFG);
  }
  if (signals.exaptation !== false) {
    pushSection(additions, options.exaptations, EXAPT_CFG);
  }
  if (signals.representationalMutation !== false) {
    pushSection(additions, options.representations, REPR_CFG);
  }
  if (signals.culture !== false) {
    pushSection(additions, options.culturalTraits, CULT_CFG);
  }
  
  return {
    enhancedPrompt: additions.length > 0 ? prompt + additions.join('') : prompt,
    domain: options.domain,
    keywords: options.keywords || [],
  };
}

module.exports = {
  buildPromptEnrichment,
  enhancePromptWithNCE,
  hasResult,
};
