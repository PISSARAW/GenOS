'use strict';

const { fail } = require('./qualityContract');
const sentences = new Intl.Segmenter('fr', { granularity: 'sentence' });

function textualValues(value) {
  if (typeof value === 'string') return [JSON.stringify(value).slice(1, -1)];
  if (value && typeof value === 'object') return Object.values(value).flatMap(textualValues);
  return [];
}
function sourceUnits(text) {
  try { return textualValues(JSON.parse(text)).filter(value => text.includes(value)); }
  catch (_) { return text.split(/\r?\n/); }
}

function quoteCandidates(text) {
  if (typeof text !== 'string') throw fail('GQEL_REVIEW_INVALID', 'Artifact text required.');
  const quotes = [];
  for (const unit of sourceUnits(text).flatMap(line => Array.from(sentences.segment(line), item => item.segment))) {
    const value = unit.trim();
    for (let start = 0; start < value.length; start += 144) {
      const quote = value.slice(start, start + 160).trim();
      if (quote.length >= 8) quotes.push(quote);
    }
  }
  return [...new Set(quotes)];
}

function quotedSchema(text) {
  const candidates = typeof text === 'string' ? quoteCandidates(text) : [];
  return { type: 'object', properties: { quote: { type: 'string', minLength: 8,
    ...(candidates.length ? { enum: candidates } : {}) } }, required: ['quote'], additionalProperties: false };
}

module.exports = { quoteCandidates, quotedSchema };
