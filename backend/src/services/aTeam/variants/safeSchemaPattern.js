'use strict';

const MAX_PATTERN_LENGTH = 256;
const MAX_REPEAT = 256;

function parsePattern(pattern) {
  // Accept a bounded, linear-time subset; grouping and alternation fail closed.
  if (typeof pattern !== 'string' || pattern.length > MAX_PATTERN_LENGTH) return null;
  const anchoredStart = pattern.startsWith('^');
  const anchoredEnd = hasUnescapedEndAnchor(pattern);
  const first = anchoredStart ? 1 : 0;
  const last = anchoredEnd ? pattern.length - 1 : pattern.length;
  const tokens = [];
  let index = first;
  while (index < last) {
    const atom = parseAtom(pattern, index, last);
    if (!atom) return null;
    index = atom.next;
    const quantifier = parseQuantifier(pattern, index, last);
    if (quantifier.min < 0) return null;
    index = quantifier.next;
    tokens.push({ ...atom, ...quantifier });
  }
  return { anchoredStart, anchoredEnd, tokens };
}

function hasUnescapedEndAnchor(pattern) {
  if (!pattern.endsWith('$')) return false;
  let slashes = 0;
  for (let index = pattern.length - 2; index >= 0 && pattern[index] === '\\'; index -= 1) slashes += 1;
  return slashes % 2 === 0;
}

function parseAtom(pattern, index, limit) {
  const char = pattern[index];
  if (!char || '()|{}?*+^$'.includes(char)) return null;
  if (char === '[') return parseCharacterClass(pattern, index, limit);
  if (char === '.') return { kind: 'any', next: index + 1 };
  if (char !== '\\') return { kind: 'literal', value: char, next: index + 1 };
  const escaped = pattern[index + 1];
  if (!escaped || index + 1 >= limit) return null;
  if ('dws'.includes(escaped)) return { kind: escaped, next: index + 2 };
  if ('\\.^$*+?{}[]()|-'.includes(escaped)) return { kind: 'literal', value: escaped, next: index + 2 };
  return null;
}

function parseCharacterClass(pattern, start, limit) {
  const close = pattern.indexOf(']', start + 1);
  if (close < 0 || close >= limit) return null;
  let index = start + 1;
  const negated = pattern[index] === '^';
  if (negated) index += 1;
  const ranges = [];
  while (index < close) {
    const low = pattern.charCodeAt(index);
    const high = pattern[index + 1] === '-' && index + 2 < close
      ? pattern.charCodeAt(index + 2) : low;
    if (high < low) return null;
    ranges.push([low, high]);
    index += high === low ? 1 : 3;
  }
  if (!ranges.length) return null;
  return { kind: 'class', ranges, negated, next: close + 1 };
}

function parseQuantifier(pattern, index, limit) {
  const char = pattern[index];
  const simple = { '*': [0, Infinity], '+': [1, Infinity], '?': [0, 1] }[char];
  if (simple) return { min: simple[0], max: simple[1], next: index + 1 };
  if (char !== '{') return { min: 1, max: 1, next: index };
  return parseBoundedQuantifier(pattern, index, limit);
}

function parseBoundedQuantifier(pattern, index, limit) {
  const close = pattern.indexOf('}', index + 1);
  if (close < 0 || close >= limit) return { min: -1, max: -1, next: limit };
  const parts = pattern.slice(index + 1, close).split(',');
  if (parts.length > 2) return { min: -1, max: -1, next: limit };
  const min = parseCount(parts[0]);
  const max = parts.length === 1 ? min : parseCount(parts[1]);
  if (min < 0 || max < min || max > MAX_REPEAT) return { min: -1, max: -1, next: limit };
  return { min, max, next: close + 1 };
}

function parseCount(value) {
  if (!/^\d{1,3}$/.test(value)) return -1;
  return Number(value);
}

function charMatches(value, atom) {
  if (atom.kind === 'literal') return value === atom.value;
  if (atom.kind === 'any') return value !== '\n' && value !== '\r';
  const code = value.charCodeAt(0);
  if (atom.kind === 'd') return isDigit(code);
  if (atom.kind === 'w') return isWord(code);
  if (atom.kind === 's') return isWhitespace(code);
  return matchesCharacterClass(code, atom);
}

function isDigit(code) { return code >= 48 && code <= 57; }
function isWord(code) { return isDigit(code) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95; }
function isWhitespace(code) { return [9, 10, 11, 12, 13, 32].includes(code); }

function matchesCharacterClass(code, atom) {
  const contained = atom.ranges.some(([low, high]) => code >= low && code <= high);
  return atom.negated ? !contained : contained;
}

function transitionRepeat(previous, value, atom) {
  if (atom.max === Infinity) return transitionUnbounded(previous, value, atom);
  return transitionBounded(previous, value, atom);
}

function transitionUnbounded(previous, value, atom) {
  const next = new Array(value.length + 1).fill(false);
  next[0] = atom.min === 0 && previous[0];
  for (let pos = 1; pos <= value.length; pos += 1) next[pos] = unboundedMatch({ previous, next, value, atom, pos });
  return next;
}

function unboundedMatch(context) {
  const { previous, next, value, atom, pos } = context;
  const matches = charMatches(value[pos - 1], atom);
  if (atom.min === 0) return previous[pos] || (next[pos - 1] && matches);
  return (previous[pos - 1] || next[pos - 1]) && matches;
}

function transitionBounded(previous, value, atom) {
  const next = new Array(value.length + 1).fill(false);
  let exact = previous;
  for (let count = 0; count <= atom.max; count += 1) {
    if (count >= atom.min) mergeStates(next, exact);
    exact = consumeOne(exact, value, atom);
  }
  return next;
}

function consumeOne(previous, value, atom) {
  const next = new Array(value.length + 1).fill(false);
  for (let pos = 1; pos <= value.length; pos += 1) {
    next[pos] = previous[pos - 1] && charMatches(value[pos - 1], atom);
  }
  return next;
}

function mergeStates(target, source) {
  for (let index = 0; index < target.length; index += 1) target[index] ||= source[index];
}

function matchesPattern(value, pattern) {
  const parsed = parsePattern(pattern);
  if (!parsed) return false;
  let states = new Array(value.length + 1).fill(!parsed.anchoredStart);
  if (parsed.anchoredStart) states[0] = true;
  for (const token of parsed.tokens) states = transitionRepeat(states, value, token);
  return parsed.anchoredEnd ? states[value.length] : states.some(Boolean);
}

module.exports = { isSafePattern: (pattern) => parsePattern(pattern) !== null, matchesPattern };
