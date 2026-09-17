'use strict';

function analyzeText(input = {}) {
  const text = String(input.text || '').trim();
  if (!text) throw new Error('text must be a non-empty string.');
  const oppositions = Array.isArray(input.oppositions) ? input.oppositions : [];
  const traces = Array.isArray(input.traces) ? input.traces : [];
  const supplements = Array.isArray(input.supplements) ? input.supplements : [];
  const privileged = oppositions.map((opposition) => opposition.privileged || null).filter(Boolean);
  return {
    kind: 'DeconstructiveReading',
    text,
    differance: {
      difference: oppositions.map((opposition) => [opposition.left, opposition.right]),
      deferral: input.deferral || 'meaning remains contextually deferred'
    },
    binaryOppositions: oppositions,
    privilegedTerms: privileged,
    excludedRemainders: input.excludedRemainders || [],
    traces,
    supplements,
    signifierPlay: Array.isArray(input.signifierPlay) ? input.signifierPlay : [],
    archiWriting: input.archiWriting || null,
    status: 'interpretive',
    interpretationStatus: 'provisional'
  };
}

function analyzeLogocentrism(input = {}) {
  const speech = Number(input.speechPriority || 0);
  const writing = Number(input.writingPriority || 0);
  const phonocentric = speech > writing;
  return {
    speechPriority: speech,
    writingPriority: writing,
    phonocentric,
    logocentric: input.presencePriority === true || phonocentric,
    supplementVisible: writing > 0,
    status: 'interpretive'
  };
}

function analyzeAutoimmunity(input = {}) {
  const rule = String(input.rule || '').trim();
  if (!rule) throw new Error('rule must be a non-empty string.');
  const exception = String(input.exception || '').trim();
  const threat = String(input.threat || '').trim();
  return {
    rule,
    exception: exception || null,
    threat: threat || null,
    internalThreat: Boolean(exception && threat),
    mechanism: exception ? 'self-protection-through-exposure' : 'not-demonstrated',
    status: 'interpretive',
    limitation: 'L’auto-immunité est ici modélisée comme tension interne, non comme propriété biologique.'
  };
}

module.exports = { analyzeText, analyzeLogocentrism, analyzeAutoimmunity };
