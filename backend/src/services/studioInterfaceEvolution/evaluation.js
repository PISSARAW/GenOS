'use strict';

const { digest } = require('./contract');

const DIMENSIONS = Object.freeze(['accessibility', 'performance', 'coherence', 'anti-generic']);
const VERDICTS = new Set(['PASS', 'FAIL', 'UNKNOWN']);

function list(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label}_REQUIRED`);
  return value;
}

function text(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${label}_REQUIRED`);
  return normalized;
}

function assessment(value) {
  if (!DIMENSIONS.includes(value?.dimension)) throw new Error('EVALUATOR_DIMENSION_INVALID');
  if (!VERDICTS.has(value.verdict)) throw new Error('EVALUATOR_VERDICT_INVALID');
  return {
    dimension: value.dimension, verdict: value.verdict,
    evaluatorId: text(value.evaluatorId, 'EVALUATOR_ID'),
    method: text(value.method, 'EVALUATOR_METHOD'),
    evidenceRef: text(value.evidenceRef, 'EVALUATOR_EVIDENCE_REF')
  };
}

function dimensionResult(dimension, assessments) {
  const relevant = assessments.filter(item => item.dimension === dimension);
  const verdicts = new Set(relevant.map(item => item.verdict));
  if (relevant.length === 0) return { dimension, status: 'MISSING', disagreement: false, assessments: [] };
  const disagreement = verdicts.size > 1;
  const status = disagreement ? 'DISPUTED' : relevant[0].verdict;
  return { dimension, status, disagreement, assessments: relevant };
}

function userObservation(value) {
  if (value?.kind !== 'user-session') throw new Error('USER_OBSERVATION_KIND_INVALID');
  return {
    kind: value.kind, sessionId: text(value.sessionId, 'SESSION_ID'),
    participantRef: text(value.participantRef, 'PARTICIPANT_REF'),
    taskId: text(value.taskId, 'TASK_ID'), outcome: text(value.outcome, 'OUTCOME'),
    evidenceRef: text(value.evidenceRef, 'USER_EVIDENCE_REF')
  };
}

function observations(input = {}) {
  const screenshots = list(input.screenshots || [], 'SCREENSHOTS').map(item => ({
    kind: 'screenshot', artifactRef: text(item.artifactRef, 'SCREENSHOT_REF'),
    viewport: text(item.viewport, 'SCREENSHOT_VIEWPORT')
  }));
  const userSessions = list(input.userSessions || [], 'USER_SESSIONS').map(userObservation);
  return { screenshots, userSessions, realUserObserved: userSessions.length > 0 };
}

function evaluateCandidate(input = {}) {
  if (input.candidate?.kind !== 'studio-interface-candidate') throw new Error('CANDIDATE_INVALID');
  const normalized = list(input.assessments, 'ASSESSMENTS').map(assessment);
  const dimensions = DIMENSIONS.map(name => dimensionResult(name, normalized));
  const observed = observations(input.observations);
  const result = {
    kind: 'studio-interface-evaluation', candidateHash: input.candidate.candidateHash,
    dimensions, observations: observed,
    complete: dimensions.every(item => item.status !== 'MISSING'),
    disputed: dimensions.some(item => item.disagreement),
    visualSuccess: null, deploymentAuthorized: false
  };
  return Object.freeze({ ...result, evaluationHash: digest(result) });
}

module.exports = { DIMENSIONS, evaluateCandidate };
