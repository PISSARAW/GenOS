'use strict';

const { boundedAnalysis, withEpistemicContext } = require('./philosophyAnalysisContract');

function normalizeScore(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function inputList(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  return value;
}

function optionalScore(value) {
  if (value === undefined || value === null) return null;
  if (normalizeScore(value) === null) throw new Error('credibility must be a number in [0, 1].');
  return value;
}

function requiredText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string.`);
  return value;
}

function analysis(result) {
  return withEpistemicContext(boundedAnalysis(result), {
    methodology: result.kind,
    reasoningStatus: result.status,
  });
}

function assessTestimony({ claim, source, credibility, corroboration = [], independence = null } = {}) {
  const score = optionalScore(credibility);
  const corroborating = inputList(corroboration, 'corroboration');
  return analysis({
    kind: 'testimony-assessment', claim: requiredText(claim, 'claim'), source: requiredText(source, 'source'),
    credibility: score,
    corroboration: corroborating,
    independence,
    status: score === null ? 'credibility-undetermined' : score >= 0.7 && corroborating.length > 0 ? 'supported-testimony' : 'provisional-testimony',
    limitation: 'La crédibilité est un indice contextuel ; le témoignage ne remplace ni la preuve indépendante ni la possibilité de contestation.',
  });
}

function assessDiscussion({ claims, disagreements = [], resolution = null } = {}) {
  const positions = inputList(claims, 'claims');
  const conflicts = inputList(disagreements, 'disagreements');
  return analysis({
    kind: 'epistemic-discussion',
    claims: positions,
    disagreements: conflicts,
    resolution,
    status: positions.length === 0 ? 'no-discussion-data' : conflicts.length === 0 ? 'provisional-agreement' : resolution ? 'disagreement-addressed' : 'unresolved-disagreement',
    limitation: 'L’accord social n’est pas une preuve suffisante ; les positions minoritaires et rejetées doivent rester traçables.',
  });
}

function assessCognitiveLabor({ task, agents, specializations = [], overlap = null } = {}) {
  const participants = inputList(agents, 'agents');
  const roles = inputList(specializations, 'specializations');
  return analysis({
    kind: 'distributed-cognitive-labor',
    task: task ?? null,
    agents: participants,
    specializations: roles,
    overlap,
    status: participants.length > 1 && roles.length > 0 ? 'distributed-knowledge' : 'insufficient-division',
    limitation: 'La distribution des rôles augmente la couverture potentielle mais introduit dépendance, transmission et risques de coordination.',
  });
}

function assessSituatedKnowledge({ claim, standpoint, location, accessLimits = [], affectedVoices = [] } = {}) {
  const limits = inputList(accessLimits, 'accessLimits');
  const voices = inputList(affectedVoices, 'affectedVoices');
  return analysis({
    kind: 'situated-knowledge-assessment',
    claim: claim ?? null,
    standpoint: standpoint ?? null,
    location: location ?? null,
    accessLimits: limits,
    affectedVoices: voices,
    status: standpoint && location ? 'situated-and-contextualized' : 'situatedness-incomplete',
    missingPerspectives: Math.max(0, limits.length - voices.length),
    limitation: 'Situer un savoir explicite sa perspective et ses limites ; cela ne le rend ni automatiquement vrai ni automatiquement faux.',
  });
}

function assessEmancipatoryCritique({ claim, powerRelations = [], exclusions = [], affectedVoices = [] } = {}) {
  const relations = inputList(powerRelations, 'powerRelations');
  const omitted = inputList(exclusions, 'exclusions');
  const voices = inputList(affectedVoices, 'affectedVoices');
  return analysis({
    kind: 'emancipatory-epistemic-critique',
    claim: claim ?? null,
    powerRelations: relations,
    exclusions: omitted,
    affectedVoices: voices,
    status: omitted.length > 0 ? 'exclusion-identified' : relations.length > 0 ? 'power-context-identified' : 'context-undetermined',
    limitation: 'Une critique des rapports de pouvoir ouvre une enquête de provenance et de participation ; elle ne décide pas seule de la vérité du claim.',
  });
}

module.exports = { assessTestimony, assessDiscussion, assessCognitiveLabor, assessSituatedKnowledge, assessEmancipatoryCritique };
