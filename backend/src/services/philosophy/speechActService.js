'use strict';

const FORCES = new Set(['assertive', 'directive', 'commissive', 'expressive', 'declarative', 'question']);
const ACT_TYPES = new Set(['constative', 'performative']);

const PERFORMATIVE_PATTERNS = Object.freeze([
  [/^je promets\b/i, 'commissive'],
  [/^je m'engage\b/i, 'commissive'],
  [/^je vous remercie\b/i, 'expressive'],
  [/^je m'excuse\b/i, 'expressive'],
  [/^je déclare\b/i, 'declarative'],
  [/^je nomme\b/i, 'declarative']
]);

function analyzeSpeechAct(input = {}) {
  const utterance = requireNonEmpty(input.utterance, 'utterance');
  const force = resolveForce(input, utterance);
  const actType = resolveActType(input, utterance, force);
  const conditions = evaluateFelicityConditions(input, force);
  return buildSpeechActReport({ utterance, force, actType, conditions, input });
}

function requireNonEmpty(value, field) {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new Error(`${field} must be a non-empty string.`);
  return trimmed;
}

function resolveForce(input, utterance) {
  const force = input.force || inferForce(utterance);
  if (!FORCES.has(force)) throw new Error(`Unknown illocutionary force '${force}'.`);
  return force;
}

function resolveActType(input, utterance, force) {
  const actType = input.actType || classifyActType(utterance, force);
  if (!ACT_TYPES.has(actType)) throw new Error(`Unknown speech act type '${actType}'.`);
  return actType;
}

function buildSpeechActReport(ctx) {
  const { utterance, force, actType, conditions, input } = ctx;
  return {
    utterance,
    actType,
    locution: { text: utterance, proposition: input.proposition || null },
    illocution: { force, directness: input.directness || inferDirectness(utterance, force) },
    perlocution: { intended: input.perlocution || null, observed: input.observedEffect || null },
    conditionsOfSatisfaction: input.conditionsOfSatisfaction || [],
    felicity: conditions,
    indirectAct: inferIndirectAct(utterance, force),
    directionOfFit: directionOfFit(force),
    intentionStatus: input.intent ? 'declared' : 'inferred',
    intention: input.intent || null
  };
}

function inferForce(utterance) {
  if (/^(je promets|je m'engage)\b/i.test(utterance)) return 'commissive';
  if (/^(je vous remercie|je m'excuse)\b/i.test(utterance)) return 'expressive';
  if (/^(je déclare|je nomme)\b/i.test(utterance)) return 'declarative';
  if (/^(pouvez-vous|pourriez-vous|seriez-vous disposé)/i.test(utterance)) return 'directive';
  if (utterance.endsWith('?')) return 'question';
  if (/^(please|merci de|veuillez)\b/i.test(utterance)) return 'directive';
  return 'assertive';
}

function classifyActType(utterance, force) {
  return PERFORMATIVE_PATTERNS.some(([pattern]) => pattern.test(utterance)) || force === 'declarative'
    ? 'performative' : 'constative';
}

function inferDirectness(utterance, force) {
  return force === 'directive' && /^(pouvez-vous|pourriez-vous|seriez-vous disposé)/i.test(utterance)
    ? 'indirect' : 'direct';
}

function inferIndirectAct(utterance, force) {
  const indirect = inferDirectness(utterance, force) === 'indirect';
  return { detected: indirect, literalForce: force === 'question' ? 'question' : force, intendedForce: indirect ? 'directive' : force };
}

function evaluateFelicityConditions(input, force) {
  const checks = buildFelicityChecks(input);
  return { checks, satisfied: Object.values(checks).every(Boolean), status: 'assessed' };
}

function buildFelicityChecks(input) {
  return {
    speaker: Boolean(input.speaker),
    addressee: Boolean(input.addressee),
    authority: input.authority !== false,
    sincerity: input.sincerity !== false,
    uptake: input.uptake !== false
  };
}

function directionOfFit(force) {
  if (force === 'assertive') return 'word_to_world';
  if (force === 'directive' || force === 'commissive') return 'world_to_word';
  return 'mixed_or_none';
}

module.exports = {
  FORCES, ACT_TYPES, analyzeSpeechAct, inferForce, classifyActType,
  inferDirectness, inferIndirectAct, evaluateFelicityConditions, directionOfFit
};
