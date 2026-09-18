'use strict';

const { text, evidence } = require('./ontologyContracts');

const FRAMEWORKS = Object.freeze(['monism-idealism', 'panpsychism', 'eliminativism', 'physicalism', 'dualism']);

function compareMindMatterModels(input = {}) {
  const subjectId = text(input.subjectId || input.agentId, 'subjectId');
  const frameworks = Array.isArray(input.frameworks) ? input.frameworks : FRAMEWORKS;
  return { subjectId, frameworks, mappings: frameworks.map(framework => ({ framework, executable: false })),
    evidence: evidence(input.evidence), limitation: 'Aucune métrique runtime ne prouve une expérience subjective.' };
}

function registerSecondOrderProperty(input = {}) {
  const property = text(input.property, 'property');
  const baseProperty = text(input.baseProperty, 'baseProperty');
  return { property, baseProperty, relation: input.relation || 'evaluates', evidence: evidence(input.evidence), status: 'descriptive' };
}

function compareEmergenceAndElimination(input = {}) {
  const phenomenon = text(input.phenomenon, 'phenomenon');
  return { phenomenon, positions: ['emergence', 'eliminativism'], verdict: 'underdetermined', evidenceStatus: 'unverified' };
}

module.exports = { FRAMEWORKS, compareMindMatterModels, registerSecondOrderProperty, compareEmergenceAndElimination };
