'use strict';

const RULE_KINDS = new Set(['constitutive', 'regulative', 'semantic', 'correction']);

function requiredText(value, field) {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${field} must be a non-empty string.`);
  return result;
}

function createLanguageGame(input = {}) {
  const name = requiredText(input.name, 'name');
  const rules = Array.isArray(input.rules) ? input.rules : [];
  const normalizedRules = rules.map(normalizeRule);
  const duplicateIds = normalizedRules
    .map((rule) => rule.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error(`Duplicate language-game rule '${duplicateIds[0]}'.`);
  return {
    apiVersion: 'genos.language-game/v1',
    kind: 'LanguageGame',
    name,
    practice: input.practice || null,
    community: input.community || null,
    formOfLife: input.formOfLife || null,
    rules: normalizedRules,
    correctionMechanism: input.correctionMechanism || 'community_response',
    meaningMode: 'use_in_practice'
  };
}

function normalizeRule(rule = {}) {
  const id = requiredText(rule.id, 'rule.id');
  const kind = rule.kind || 'regulative';
  if (!RULE_KINDS.has(kind)) throw new Error(`Unknown language-game rule kind '${kind}'.`);
  return {
    id,
    kind,
    description: requiredText(rule.description || id, 'rule.description'),
    requiredRole: rule.requiredRole || null,
    allowedActions: Array.isArray(rule.allowedActions) ? rule.allowedActions : [],
    correction: rule.correction || null
  };
}

function evaluateMove(input = {}) {
  const game = input.game;
  if (!game || !Array.isArray(game.rules)) throw new Error('game with rules is required.');
  const move = input.move;
  if (!move || typeof move !== 'object') throw new Error('move must be an object.');
  const rule = game.rules.find((candidate) => candidate.id === move.ruleId);
  if (!rule) return { accepted: false, reason: 'rule_not_found', status: 'not_evaluable' };
  const roleSatisfied = !rule.requiredRole || rule.requiredRole === input.participantRole;
  const actionSatisfied = !rule.allowedActions.length || rule.allowedActions.includes(move.action);
  const accepted = roleSatisfied && actionSatisfied;
  return {
    accepted,
    rule: rule.id,
    move,
    reason: accepted ? 'rule_satisfied' : 'rule_violation',
    violations: [
      ...(!roleSatisfied ? ['required_role'] : []),
      ...(!actionSatisfied ? ['action_not_allowed'] : [])
    ],
    correction: accepted ? null : rule.correction,
    status: 'normative_assessment'
  };
}

function assessRuleFollowing(input = {}) {
  const rule = normalizeRule(input.rule || {});
  const individual = Array.isArray(input.individualActions) ? input.individualActions : [];
  const community = Array.isArray(input.communityActions) ? input.communityActions : [];
  const individualAllowed = individual.filter((action) => rule.allowedActions.includes(action));
  const communityAllowed = community.filter((action) => rule.allowedActions.includes(action));
  const individualRate = ratio(individualAllowed.length, individual.length);
  const communityRate = ratio(communityAllowed.length, community.length);
  return {
    rule: rule.id,
    individualRate,
    communityRate,
    dispositionMatchesNorm: Math.abs(individualRate - communityRate) < 0.2,
    normativitySource: community.length ? 'community_practice' : 'undetermined',
    status: 'comparative_assessment'
  };
}

function analyzePrivateLanguage(input = {}) {
  const privateCriterion = Boolean(input.privateCriterion);
  const publicCriteria = Array.isArray(input.publicCriteria) ? input.publicCriteria : [];
  const correction = Boolean(input.correctionMechanism);
  return {
    privateCriterion,
    publicCriteriaCount: publicCriteria.length,
    correctionAvailable: correction,
    normativity: correction || publicCriteria.length ? 'socially_checkable' : 'underdetermined',
    privateLanguageConcern: privateCriterion && !correction && !publicCriteria.length,
    interpretationStatus: 'philosophical_diagnostic',
    limitation: 'Ce diagnostic ne tranche pas à lui seul l’argument du langage privé.'
  };
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(3)) : null;
}

module.exports = {
  RULE_KINDS, createLanguageGame, normalizeRule, evaluateMove,
  assessRuleFollowing, analyzePrivateLanguage
};
