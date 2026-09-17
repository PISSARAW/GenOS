'use strict';

const FORCES = new Set(['assertive', 'directive', 'commissive', 'expressive', 'declarative', 'question']);

function analyzeSpeechAct(input = {}) {
  const utterance = String(input.utterance || '').trim();
  if (!utterance) throw new Error('utterance must be a non-empty string.');
  const force = input.force || inferForce(utterance);
  if (!FORCES.has(force)) throw new Error(`Unknown illocutionary force '${force}'.`);
  return {
    utterance,
    locution: { text: utterance },
    illocution: { force, directness: input.directness || 'direct' },
    perlocution: input.perlocution || null,
    conditionsOfSatisfaction: input.conditionsOfSatisfaction || [],
    directionOfFit: directionOfFit(force),
    intentionStatus: input.intent ? 'declared' : 'inferred',
    intention: input.intent || null
  };
}

function inferForce(utterance) {
  if (utterance.endsWith('?')) return 'question';
  if (/^(please|merci de|veuillez)\b/i.test(utterance)) return 'directive';
  return 'assertive';
}

function directionOfFit(force) {
  if (force === 'assertive') return 'word_to_world';
  if (force === 'directive' || force === 'commissive') return 'world_to_word';
  return 'mixed_or_none';
}

module.exports = { FORCES, analyzeSpeechAct, inferForce, directionOfFit };
