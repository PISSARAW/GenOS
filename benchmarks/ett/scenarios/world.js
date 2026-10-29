'use strict';

const { stepsFor } = require('./protocols');

function createScenarioWorld(testCase) {
  const state = { testCase, steps: stepsFor(testCase.scenarioId, testCase.difficulty),
    evidence: new Map(testCase.observation.candidates.map((candidate) => [candidate.id, candidate.evidence])),
    inspected: new Set(), trace: [], proofRefs: [], questions: new Set(), index: 0,
    remaining: testCase.budget, submitted: null, lastEvidence: [] };
  const world = { scenarioId: testCase.scenarioId, difficulty: testCase.difficulty,
    seed: Number(testCase.caseId.split('-').at(-1)), caseId: testCase.caseId,
    act: (action) => act(state, action), result: () => result(state),
    get trace() { return structuredClone(state.trace); },
    get observation() { return observation(state); },
    get remaining() { return state.remaining; }, get terminal() { return state.submitted !== null; } };
  return Object.freeze(world);
}

function observation(state) {
  const current = state.steps[state.index] || null;
  return { ...state.testCase.observation,
    objective: state.testCase.observation.objective,
    candidates: state.testCase.observation.candidates.map(({ id }) => ({ id })),
    availableActions: current ? [current.type] : ['submit_answer'],
    nextAction: current ? { type: current.type, stepId: current.id,
      step: current.index, totalSteps: state.steps.length,
      requiredFields: current.fields, guidance: guidance(state.testCase.scenarioId, current.id) } : null,
    completedSteps: state.index, totalSteps: state.steps.length,
    actionBudget: state.testCase.budget, actionsRemaining: state.remaining };
}

function guidance(scenarioId, stepId) {
  return `${scenarioId} protocol step: ${stepId}. Use public evidence and provide each required field.`;
}

function act(state, action) {
  if (state.submitted) throw new Error('Scenario is terminal.');
  if (state.remaining < 1) return reject('action_budget_exhausted', state.remaining);
  state.remaining -= 1;
  if (!action || typeof action !== 'object') return recordInvalid(state, 'malformed');
  if (action.type === 'submit_answer') return submit(state, action);
  const current = state.steps[state.index];
  if (!current || action.type !== current.type) return recordInvalid(state, 'unexpected_action');
  const validation = validateStep(state, current, action);
  if (!validation.valid) return recordInvalid(state, `invalid_field:${validation.field}`);
  return completeStep({ state, step: current, action, candidateIds: validation.candidateIds });
}

function validateStep(state, step, action) {
  for (const [field, kind] of Object.entries(step.fields)) {
    const value = action[field];
    if (!validField(value, kind, state.evidence)) return { valid: false, field };
  }
  return { valid: true, candidateIds: candidateFields(step, action) };
}

function validField(value, kind, evidence) {
  const validators = { candidate: () => evidence.has(value), text: () => validText(value),
    probability: () => Number.isFinite(value) && value >= 0 && value <= 1,
    number: () => Number.isFinite(value), number_vector: () => validVector(value, 'number'),
    boolean_vector: () => validVector(value, 'boolean'), boolean: () => typeof value === 'boolean' };
  return validators[kind]?.() || false;
}

function validText(value) {
  return typeof value === 'string' && value.trim().length >= 5 && value.length <= 2000;
}

function validVector(value, type) {
  const length = type === 'number' ? 3 : 5;
  const validItem = type === 'number' ? Number.isFinite : (item) => typeof item === 'boolean';
  return Array.isArray(value) && value.length === length && value.every(validItem);
}

function candidateFields(step, action) {
  return Object.keys(step.fields).filter((field) => step.fields[field] === 'candidate')
    .map((field) => action[field]);
}

function completeStep(input) {
  const { state, step, action, candidateIds } = input;
  const revealed = candidateIds.map((candidateId) => ({ candidateId,
    evidence: state.evidence.get(candidateId) }));
  const novelQuestion = questionIsNovel(state, action);
  for (const candidateId of candidateIds) state.inspected.add(candidateId);
  state.lastEvidence = revealed;
  state.proofRefs.push(step.ref);
  recordQuestion(state, action);
  state.trace.push({ type: action.type, stepId: step.id, action: { ...action },
    proofRef: step.ref, revealed: structuredClone(revealed) });
  state.index += 1;
  return { status: 'observed', stepId: step.id, proofRef: step.ref,
    revealed, progress: state.index, totalSteps: state.steps.length,
    novelQuestion, remaining: state.remaining };
}

function recordQuestion(state, action) {
  const question = String(action.question || '').trim().toLowerCase();
  if (question) state.questions.add(question);
}

function questionIsNovel(state, action) {
  if (!/question|cycle/i.test(action.type)) return null;
  const question = String(action.question || '').trim().toLowerCase();
  return question.length > 0 && !state.questions.has(question);
}

function submit(state, action) {
  if (state.index < state.steps.length) return recordInvalid(state, 'protocol_incomplete');
  if (!state.evidence.has(action.answerId) || !state.inspected.has(action.answerId)) {
    return recordInvalid(state, 'answer_requires_inspected_evidence');
  }
  state.submitted = { answerId: action.answerId,
    evidenceRefs: [`candidate:${action.answerId}:inspection`, ...state.proofRefs],
    actions: state.trace.length + 1,
    progress: state.index, questionCount: state.questions.size };
  state.trace.push({ type: action.type, answerId: action.answerId });
  return { status: 'submitted', remaining: state.remaining, progress: state.index };
}

function recordInvalid(state, reason) {
  state.trace.push({ type: 'invalid', reason });
  return reject(reason, state.remaining);
}

function reject(reason, remaining) {
  return { status: 'rejected', reason, remaining };
}

function result(state) {
  if (!state.submitted) return null;
  const trace = structuredClone(state.trace);
  return { ...state.submitted, trace, actionTrace: structuredClone(trace),
    inspectedCandidates: [...state.inspected] };
}

module.exports = { createScenarioWorld };
