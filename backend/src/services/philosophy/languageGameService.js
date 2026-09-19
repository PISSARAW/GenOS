'use strict';

const RULE_KINDS = new Set(['constitutive', 'regulative', 'semantic', 'correction']);

function requiredText(value, field) {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${field} must be a non-empty string.`);
  return result;
}

function createLanguageGame(input = {}) {
  const name = requiredText(input.name, 'name');
  const rules = toArray(input.rules);
  const normalizedRules = rules.map(normalizeRule);
  validateNoDuplicateRuleIds(normalizedRules);
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

function toArray(value) { return Array.isArray(value) ? value : []; }

function validateNoDuplicateRuleIds(rules) {
  const ids = rules.map((r) => r.id);
  const dup = ids.filter((id, i, arr) => arr.indexOf(id) !== i);
  if (dup.length) throw new Error(`Duplicate language-game rule '${dup[0]}'.`);
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
    allowedActions: toArray(rule.allowedActions),
    correction: rule.correction || null
  };
}

function evaluateMove(input = {}) {
  const game = requireGame(input.game);
  const move = requireMove(input.move);
  const rule = findRule(game, move.ruleId);
  if (!rule) return { accepted: false, reason: 'rule_not_found', status: 'not_evaluable' };
  return assessMove({ game, rule, move, participantRole: input.participantRole });
}

function requireGame(game) {
  if (!game || !Array.isArray(game.rules)) throw new Error('game with rules is required.');
  return game;
}

function requireMove(move) {
  if (!move || typeof move !== 'object') throw new Error('move must be an object.');
  return move;
}

function findRule(game, ruleId) {
  return game.rules.find((c) => c.id === ruleId);
}

function assessMove(ctx) {
  const { game, rule, move, participantRole } = ctx;
  const roleOk = roleAllowed(rule, participantRole);
  const actionOk = actionAllowed(rule, move.action);
  const accepted = roleOk && actionOk;
  return {
    accepted,
    rule: rule.id,
    move,
    reason: accepted ? 'rule_satisfied' : 'rule_violation',
    violations: violationList(roleOk, actionOk),
    correction: accepted ? null : rule.correction,
    status: 'normative_assessment'
  };
}

function roleAllowed(rule, participantRole) {
  return !rule.requiredRole || rule.requiredRole === participantRole;
}

function actionAllowed(rule, action) {
  return !rule.allowedActions.length || rule.allowedActions.includes(action);
}

function violationList(roleOk, actionOk) {
  const v = [];
  if (!roleOk) v.push('required_role');
  if (!actionOk) v.push('action_not_allowed');
  return v;
}

function assessRuleFollowing(input = {}) {
  const rule = normalizeRule(input.rule || {});
  const individual = toArray(input.individualActions);
  const community = toArray(input.communityActions);
  const individualAllowed = individual.filter((a) => rule.allowedActions.includes(a));
  const communityAllowed = community.filter((a) => rule.allowedActions.includes(a));
  return {
    rule: rule.id,
    individualRate: ratio(individualAllowed.length, individual.length),
    communityRate: ratio(communityAllowed.length, community.length),
    dispositionMatchesNorm: Math.abs(ratio(individualAllowed.length, individual.length) - ratio(communityAllowed.length, community.length)) < 0.2,
    normativitySource: community.length ? 'community_practice' : 'undetermined',
    status: 'comparative_assessment'
  };
}

function analyzePrivateLanguage(input = {}) {
  const privateCriterion = Boolean(input.privateCriterion);
  const publicCriteria = toArray(input.publicCriteria);
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
