'use strict';

const { fail } = require('./qualityContract');

function quoteCandidates(text) {
  if (typeof text !== 'string') throw fail('GQEL_REVIEW_INVALID', 'Artifact text required.');
  const quotes = [];
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
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
