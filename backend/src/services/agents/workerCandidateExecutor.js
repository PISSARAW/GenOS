'use strict';

const { methodInput, error, text, list, resultReport } = require('./workerNativeEvidence');

function validDimension(dimension) {
  return text(dimension?.name, 128) && list(dimension.options, (item) => text(item, 256), 10);
}

function validEvidence(item, refs) {
  return text(item?.dimension, 128) && text(item.option, 256)
    && text(item.goalCue, 128) && refs.includes(item.sourceRef);
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
  if (!text(input.goal) || !list(input.evidence, (item) => validEvidence(item, input.sourceRefs), 40)) {
    throw error('WORKER_CREATIVE_INPUT_INVALID', 'A goal and attributed option evidence are required.');
  }
  const combinations = input.dimensions.reduce((total, item) => total * item.options.length, 1);
  if (combinations > 100) throw error('WORKER_CREATIVE_INPUT_INVALID', 'Candidate budget is at most 100 combinations.');
  return true;
}

function rankCandidates(dimensions, input) {
  const goal = input.goal.toLocaleLowerCase();
  const combinations = dimensions.reduce((rows, dimension) => rows.flatMap((row) =>
    dimension.options.map((option) => [...row, { dimension: dimension.name, option }])), [[]]);
  return combinations.map((parts) => {
    const matches = input.evidence.filter((item) => goal.includes(item.goalCue.toLocaleLowerCase())
      && parts.some((part) => part.dimension === item.dimension && part.option === item.option));
    return { candidate: parts.map((part) => `${part.dimension}: ${part.option}`).join('; '),
      score: matches.length, evidence: [...new Set(matches.map((item) => item.sourceRef))] };
  }).sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate, 'en'));
}

function runCandidates(method) {
  assertCandidateInput(method);
  const input = method.parameters;
  const candidates = rankCandidates(input.dimensions, input);
  const output = { candidate: candidates[0].candidate,
    alternatives: candidates.slice(1).map((item) => item.candidate),
    selectedEvidence: candidates[0].evidence, candidateScores: candidates,
    assumptions: input.assumptions, falsificationTest: input.falsificationTest,
    selectionRule: 'Goal-aligned evidence ranking' };
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
