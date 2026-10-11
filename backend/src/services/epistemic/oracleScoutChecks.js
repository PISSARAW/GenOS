'use strict';

const VERSION = 'genos.scout-literal-postconditions/v1';
const STRATEGIES = new Set(['scout_index_search', 'scout_character_scan']);

function outcome(status, reason, strategy) { return { schema: VERSION, status, reason, strategy }; }

function validMethod(method) {
  const sources = method?.parameters?.sources;
  const terms = method?.parameters?.terms;
  return validMethodIdentity(method) && validSources(sources) && validTerms(terms);
}

function validMethodIdentity(method) {
  return method?.version === 1 && method.methodId === 'scan_literal';
}

function validSources(sources) {
  return Array.isArray(sources) && sources.length > 0 && sources.length <= 20
    && sources.every(validSource) && new Set(sources.map(source => source.sourceRef)).size === sources.length;
}

function validSource(source) {
  return typeof source?.sourceRef === 'string' && Boolean(source.sourceRef.trim())
    && source.sourceRef.length <= 256 && typeof source.text === 'string' && source.text.length <= 8192;
}

function validTerms(terms) {
  return Array.isArray(terms) && terms.length > 0 && terms.length <= 20 && terms.every(validTerm);
}

function validTerm(term) {
  return typeof term === 'string' && Boolean(term.trim()) && term.length <= 128;
}

function findByIndex(text, term) { return text.indexOf(term); }

function findByCharacters(text, term) {
  for (let start = 0; start <= text.length - term.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < term.length; offset += 1) {
      if (text[start + offset] !== term[offset]) { matched = false; break; }
    }
    if (matched) return start;
  }
  return -1;
}

function expectedObservations(method, finder) {
  return method.parameters.sources.flatMap(source => method.parameters.terms.flatMap(term => {
    const offset = finder(source.text, term);
    return offset < 0 ? [] : [{ observation: `Literal '${term}' found at offset ${offset}.`,
      sourceRefs: [source.sourceRef], confidence: 1,
      uncertainties: ['No semantic interpretation or source authenticity check.'], term, offset }];
  }));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function checkScout(subject, strategy) {
  if (!STRATEGIES.has(strategy) || !validMethod(subject?.method)) {
    return outcome('inconclusive', 'scout_oracle_domain_unavailable', strategy);
  }
  const output = subject.output;
  const finder = strategy === 'scout_index_search' ? findByIndex : findByCharacters;
  const expected = expectedObservations(subject.method, finder);
  const refs = subject.method.parameters.sources.map(source => source.sourceRef);
  const receiptContent = { observations: expected, scannedSources: refs,
    termCount: subject.method.parameters.terms.length };
  const digest = require('node:crypto').createHash('sha256').update(canonical({
    methodContract: subject.method, content: receiptContent })).digest('hex');
  const criteria = { observations: require('node:util').isDeepStrictEqual(output.observations, expected),
    scannedSources: require('node:util').isDeepStrictEqual(output.scannedSources, refs),
    termCount: output.termCount === subject.method.parameters.terms.length,
    receipt: output.scoutReceipt?.id === `solver://sha256:${digest}` };
  const valid = Object.values(criteria).every(Boolean);
  return { ...outcome(valid ? 'verified' : 'refuted',
    valid ? 'scout_literal_postconditions_checked' : 'scout_literal_postcondition_false', strategy), criteria };
}

module.exports = { VERSION, STRATEGIES, checkScout };
