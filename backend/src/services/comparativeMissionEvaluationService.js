'use strict';

const { loadFixture } = require('./comparativeMissionFixtureService');
const { validateSchedulingResult } = require('./metapopulation/schedulingEvidenceValidator');

function evaluateFixtureSubmission(input) {
  const fixture = loadFixture(input.fixtureId);
  const evaluators = {
    'two-machine-scheduling': evaluateScheduling,
    'constraint-checklist': evaluateEnvironments,
    'parser-contract': evaluateParser,
    'bin-packing': evaluateBinPacking,
    'synthetic-finding-validation': evaluateSecurity,
    'collapse-recolonization': evaluateRecolonization
  };
  const evaluate = evaluators[fixture.evaluation.kind];
  return evaluate ? evaluate({ fixture, submission: input.submission, answer: input.answer, method: input.method }) : unavailable();
}

function evaluateScheduling({ fixture, answer, method }) {
  const jobs = Object.entries(fixture.problem.inputs.jobs).map(([id, duration]) => `${id}=${duration}`).join(', ');
  const mission = `${jobs}; LPT; ${fixture.problem.inputs.machines} machines; minimize makespan.`;
  const result = validateSchedulingResult({ mission, answer, method });
  return result ? { ...result, fitnessValue: result.computedMakespan, fitnessDirection: 'minimize' } : unavailable();
}

function evaluateEnvironments({ fixture, submission, method }) {
  const environments = submission?.environments || {};
  const required = fixture.evaluation.required;
  const population = fixture.populations.find((item) => normalize(item.method) === normalize(method));
  const environment = environments[population?.id] || submission?.environment;
  const checks = environment?.checks || {};
  const evidence = evidenceList(environment?.evidenceRefs);
  const passed = required.filter((criterion) => checks[criterion] === true);
  const fitnessValue = passed.length / required.length;
  const valid = Boolean(population && passed.length === required.length && evidence.length > 0);
  return { applicable: true, valid, fitnessValue, fitnessDirection: population?.fitness.direction,
    reasons: valid ? [] : ['This environment needs all required design checks and evidence references.'] };
}

function evaluateParser({ fixture, submission }) {
  return { applicable: true, valid: false,
    reasons: ['An isolated parser implementation runner is not configured; design claims and worker-supplied receipts are not execution evidence.'] };
}

function evaluateBinPacking({ fixture, submission }) {
  const assignments = Array.isArray(submission?.bins) ? submission.bins : [];
  const items = fixture.problem.inputs.items;
  const assigned = assignments.flatMap((bin) => Array.isArray(bin.items) ? bin.items : []);
  const ids = assigned.map((item) => item.id);
  const uniqueAndComplete = ids.length === Object.keys(items).length
    && new Set(ids).size === ids.length && ids.every((id) => Object.hasOwn(items, id));
  const weightsMatch = assigned.every((item) => items[item.id] === item.weight);
  const capacitiesHold = assignments.every((bin) => bin.items.reduce((sum, item) => sum + item.weight, 0) <= fixture.problem.inputs.capacity);
  const lowerBoundReached = assignments.length <= fixture.evaluation.knownLowerBound;
  const valid = uniqueAndComplete && weightsMatch && capacitiesHold && lowerBoundReached;
  return { applicable: true, valid, fitness: assignments.length, fitnessValue: assignments.length, fitnessDirection: 'minimize',
    reasons: valid ? [] : ['Assignments must cover each item once, preserve weights, respect capacity and meet the known lower bound.'] };
}

function evaluateSecurity({ fixture, submission }) {
  const expected = fixture.evaluation.knownFindings || [];
  const system = fixture.problem.inputs.system.toLowerCase();
  const findings = Array.isArray(submission?.findings) ? submission.findings : [];
  const validated = expected.filter((finding) => findings.some((candidate) => candidate.id === finding.id
    && typeof candidate.evidenceRef === 'string'
    && candidate.evidenceRef.toLowerCase().includes(finding.reference.toLowerCase())
    && system.includes(candidate.evidenceRef.toLowerCase())
    && candidate.evidenceRef.length >= 12));
  const valid = validated.length === expected.length;
  return { applicable: true, valid, fitness: validated.length, fitnessValue: validated.length, fitnessDirection: 'maximize',
    validatedFindingIds: validated.map((finding) => finding.id),
    reasons: valid ? [] : ['Each expected finding must cite a matching passage from the supplied pseudo-system.'] };
}

function evaluateRecolonization({ fixture, submission }) {
  const context = { fixture, submission: submission || {}, data: fixture.problem.inputs };
  const recovery = context.submission.recolonization || {};
  const valid = collapseIsDemonstrated(context) && founderSetIsDiverse(context, recovery)
    && recoveryIsViable(context, recovery) && survivorsContinue(context);
  const fitnessValue = portfolioValue(recovery.projects, context.data.projects);
  return { applicable: true, valid, fitness: fitnessValue, fitnessValue, fitnessDirection: 'maximize',
    reasons: valid ? [] : ['Collapse, post-constraint viability, multiple founder lineages and non-clonal recovery must all be demonstrated.'] };
}

function collapseIsDemonstrated({ fixture, submission, data }) {
  const collapse = submission.collapse || {};
  const selection = collapse.initialSelection;
  return portfolioFits(selection, data.projects, data.budget)
    && sameItems(selection, fixture.evaluation.invalidatedInitialSelection)
    && collapse.populationId === data.constraintChange.collapsedPopulationId
    && !portfolioFits(selection, data.projects, data.constraintChange.to);
}

function founderSetIsDiverse({ fixture, submission }, recovery) {
  const founders = new Set(recovery.founderLineages || []);
  return founders.size >= fixture.evaluation.minimumFounderLineages
    && Array.isArray(submission.continuingPopulations);
}

function recoveryIsViable({ data }, recovery) {
  return portfolioFits(recovery.projects, data.projects, data.constraintChange.to)
    && !sameItems(recovery.projects, recovery.neighborProjects);
}

function survivorsContinue({ fixture, submission, data }) {
  const continuing = submission.continuingPopulations || [];
  const ids = new Set(continuing.map((item) => item.populationId));
  return continuing.length === fixture.populations.length - 1 && ids.size === continuing.length
    && continuing.every((item) => item.populationId !== data.constraintChange.collapsedPopulationId
      && portfolioFits(item.projects, data.projects, data.constraintChange.to));
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function portfolioFits(ids, projects, budget) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some((id) => !projects[id])) return false;
  return ids.reduce((sum, id) => sum + projects[id].cost, 0) <= budget;
}

function portfolioValue(ids, projects) {
  return Array.isArray(ids) ? ids.reduce((sum, id) => sum + (projects[id]?.value || 0), 0) : 0;
}

function sameItems(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  return left.length === right.length && [...left].sort().every((item, index) => item === [...right].sort()[index]);
}

function evidenceList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
}

function unavailable() {
  return { applicable: true, valid: false, reasons: ['No deterministic evaluator is registered for this fixture.'] };
}

module.exports = { evaluateFixtureSubmission };
