'use strict';

const { methodInput, error, text, list, resultReport } = require('./workerNativeEvidence');

function validDimension(dimension) {
  return text(dimension?.name, 128) && list(dimension.options, (item) => text(item, 256), 10);
}

function assertCandidateInput(method) {
  const input = methodInput(method, 'combine_candidates');
  if (!list(input.dimensions, validDimension, 4)) throw error('WORKER_CREATIVE_INPUT_INVALID', 'Provide 1-4 bounded dimensions.');
  if (new Set(input.dimensions.map((item) => item.name)).size !== input.dimensions.length) {
    throw error('WORKER_CREATIVE_INPUT_INVALID', 'Dimension names must be unique.');
  }
  if (!list(input.assumptions, (item) => text(item), 20) || !text(input.falsificationTest)) {
    throw error('WORKER_CREATIVE_INPUT_INVALID', 'Assumptions and a falsification test are required.');
  }
  if (!list(input.sourceRefs, (item) => text(item, 256), 20)) throw error('WORKER_CREATIVE_INPUT_INVALID', 'Source references are required.');
  const combinations = input.dimensions.reduce((total, item) => total * item.options.length, 1);
  if (combinations > 100) throw error('WORKER_CREATIVE_INPUT_INVALID', 'Candidate budget is at most 100 combinations.');
  return true;
}

function enumerate(dimensions) {
  let combinations = [''];
  for (const dimension of dimensions) {
    combinations = combinations.flatMap((prefix) => dimension.options.map((option) =>
      `${prefix}${prefix ? '; ' : ''}${dimension.name}: ${option}`));
  }
  return [...new Set(combinations)];
}

function runCandidates(method) {
  assertCandidateInput(method);
  const input = method.parameters;
  const candidates = enumerate(input.dimensions);
  const output = { candidate: candidates[0], alternatives: candidates.slice(1),
    assumptions: input.assumptions, falsificationTest: input.falsificationTest,
    selectionRule: 'First combination in the supplied order; quality and novelty unverified.' };
  return resultReport(method, output, { type: 'creative_candidate',
    statement: `${candidates.length} combinations generated from supplied design dimensions; parent review required.`,
    sourceRefs: input.sourceRefs });
}

function validConsideration(item) {
  return text(item?.consideration) && text(item.sourceRef, 256);
}

function assertClinicalInput(method) {
  const input = methodInput(method, 'review_synthetic_case');
  if (input.caseScope !== 'synthetic_educational' || !text(input.vignette)) {
    throw error('WORKER_MEDICAL_INPUT_INVALID', 'An explicitly synthetic educational vignette is required.');
  }
  if (!list(input.considerations, validConsideration, 20) || !text(input.uncertainty)) {
    throw error('WORKER_MEDICAL_INPUT_INVALID', 'Use referenced educational considerations and explicit uncertainty.');
  }
  return true;
}

function runClinical(method) {
  assertClinicalInput(method);
  const input = method.parameters;
  const output = { caseScope: 'synthetic_educational',
    differentialConsiderations: input.considerations.map((item) => item.consideration),
    uncertainty: input.uncertainty, safetyNote: 'Synthetic educational material only. No individual diagnosis or treatment advice.',
    evidence: input.considerations.map((item) => item.sourceRef) };
  const report = resultReport(method, output, { type: 'clinical_report',
    statement: 'Referenced considerations compiled for an explicitly synthetic educational vignette.', sourceRefs: output.evidence });
  return report;
}

module.exports = { assertCandidateInput, runCandidates, assertClinicalInput, runClinical };
