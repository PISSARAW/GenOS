'use strict';

const FUNCTIONS = Object.freeze(['referential', 'emotive', 'conative', 'phatic', 'metalingual', 'poetic']);

function analyzeMessage(input = {}) {
  const message = String(input.message || '').trim();
  if (!message) throw new Error('message must be a non-empty string.');
  const dominant = input.dominant || inferDominant(message);
  if (!FUNCTIONS.includes(dominant)) throw new Error(`Unknown poetic function '${dominant}'.`);
  return {
    kind: 'PoeticMessage',
    message,
    dominantFunction: dominant,
    functions: FUNCTIONS,
    parallelisms: Array.isArray(input.parallelisms) ? input.parallelisms : [],
    repetitions: findRepetitions(message),
    code: input.code || null,
    addressee: input.addressee || null,
    status: 'structured'
  };
}

function inferDominant(message) {
  if (/\b(je|moi|mon|ma|mes)\b/i.test(message)) return 'emotive';
  if (/[!?]/.test(message)) return 'conative';
  return 'poetic';
}

function findRepetitions(message) {
  const words = message.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return [...new Set(words.filter((word, index) => words.indexOf(word) !== index))];
}

module.exports = { FUNCTIONS, analyzeMessage, inferDominant, findRepetitions };
