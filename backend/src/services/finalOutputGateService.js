'use strict';

const NUMBER_PATTERN = /[-+]?\d+(?:[.,]\d+)?/g;

function numbers(text) {
  return String(text || '').match(NUMBER_PATTERN) || [];
}

function claimMap(report) {
  return new Map((report?.propositions || report?.claims || []).map((claim) => [claim.id, claim]));
}

function sentenceClaimIds(sentence) {
  const explicit = Array.isArray(sentence.claimIds) ? sentence.claimIds : [];
  const tags = String(sentence.text || '').match(/\[claim:([^\]]+)\]/g) || [];
  return [...new Set([...explicit, ...tags.map((tag) => tag.slice(7, -1))])];
}

function issue(code, sentence, detail) {
  return { code, sentence: String(sentence.text || '').slice(0, 160), detail };
}

function checkCitations(sentence, claims, issues) {
  const ids = sentenceClaimIds(sentence);
  if (sentence.kind === 'factual' && ids.length === 0) issues.push(issue('MISSING_CITATION', sentence, 'Factual sentences require a claim id'));
  const cited = ids.map((id) => claims.get(id));
  ids.forEach((id, index) => { if (!cited[index]) issues.push(issue('UNKNOWN_CLAIM', sentence, id)); });
  return cited.filter(Boolean);
}

function checkNumbers(sentence, cited, issues) {
  const allowed = new Set(cited.flatMap((claim) => numbers(claim.statement || claim.proposition)));
  for (const value of numbers(sentence.text)) if (!allowed.has(value)) issues.push(issue('INVENTED_NUMBER', sentence, value));
}

function hasContradiction(claim) {
  return claim.confidence === 'contested' || (Array.isArray(claim.contradictedBy) && claim.contradictedBy.length > 0);
}

function checkPolarity(sentence, cited, issues) {
  if (sentence.kind !== 'factual') return;
  for (const claim of cited) {
    if (hasContradiction(claim)) issues.push(issue('CONTRADICTION_UNRESOLVED', sentence, claim.id));
    if (['failed', 'refuted', 'rejected'].includes(claim.outcome)) issues.push(issue('INVERTED_OUTCOME', sentence, claim.id));
  }
}

function gateFinalOutput(input) {
  const output = input || {};
  const claims = claimMap(output.report);
  const issues = [];
  const sentences = Array.isArray(output.sentences) ? output.sentences : [];
  for (const sentence of sentences) {
    const cited = checkCitations(sentence, claims, issues);
    checkNumbers(sentence, cited, issues);
    checkPolarity(sentence, cited, issues);
  }
  const passed = issues.length === 0;
  return { passed, completionAllowed: passed, issues, checkedSentences: sentences.length, checkedClaims: claims.size };
}

function assertFinalOutput(input) {
  const result = gateFinalOutput(input);
  if (!result.passed) {
    const error = new Error('Final output blocked by evidence gate');
    error.code = 'FINAL_OUTPUT_GATE_BLOCKED';
    error.gate = result;
    throw error;
  }
  return result;
}

module.exports = { gateFinalOutput, assertFinalOutput };
