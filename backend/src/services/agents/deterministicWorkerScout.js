'use strict';

const { createHash } = require('node:crypto');

function scoutError(message) {
  return Object.assign(new Error(message), { code: 'WORKER_SCOUT_INPUT_INVALID' });
}

function validSource(source) {
  return typeof source?.sourceRef === 'string' && Boolean(source.sourceRef.trim())
    && source.sourceRef.length <= 256 && typeof source.text === 'string'
    && source.text.length <= 8192;
}

function validTerm(term) {
  return typeof term === 'string' && Boolean(term.trim()) && term.length <= 128;
}

function assertScoutInput(methodContract) {
  const { sources, terms } = methodContract?.parameters || {};
  if (!validMethod(methodContract, sources, terms)) {
    throw scoutError('Scout scanning requires 1-20 bounded sources and literal terms.');
  }
  if (new Set(sources.map((source) => source.sourceRef)).size !== sources.length) {
    throw scoutError('Scout source references must be unique.');
  }
  return true;
}

function validMethod(methodContract, sources, terms) {
  return methodContract?.version === 1 && methodContract.methodId === 'scan_literal'
    && Array.isArray(sources) && sources.length >= 1 && sources.length <= 20
    && sources.every(validSource) && Array.isArray(terms)
    && terms.length >= 1 && terms.length <= 20 && terms.every(validTerm);
}

function scanSource(source, terms) {
  const haystack = source.text.toLocaleLowerCase('en');
  return terms.flatMap((term) => {
    const offset = haystack.indexOf(term.toLocaleLowerCase('en'));
    if (offset < 0) return [];
    return [{ observation: `Literal '${term}' found at offset ${offset}.`,
      sourceRefs: [source.sourceRef], confidence: 1,
      uncertainties: ['No semantic interpretation or source authenticity check.'],
      term, offset }];
  });
}

function runScout(methodContract) {
  assertScoutInput(methodContract);
  const { sources, terms } = methodContract.parameters;
  const observations = sources.flatMap((source) => scanSource(source, terms));
  const sourceRefs = sources.map((source) => source.sourceRef);
  const content = { observations, scannedSources: sourceRefs, termCount: terms.length };
  const digest = createHash('sha256').update(JSON.stringify({ methodContract, content })).digest('hex');
  return { ...content, scoutReceipt: { id: `solver://sha256:${digest}` } };
}

module.exports = { assertScoutInput, runScout };
