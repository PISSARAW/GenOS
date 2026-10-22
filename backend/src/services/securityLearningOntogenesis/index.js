'use strict';

const {
  LEARNING_STAGES,
  QUALIFICATION_DISPOSITIONS,
  learningError,
  sha256Prefixed,
  assertStageTransition,
  verifyArtifactWithGvx,
  issueIndependentVerifierReceipt,
  isReceiptTrustedAndValid,
} = require('./learningStageContract');

const {
  createLearningSession,
  recordObservation,
  formulateHypothesis,
  executeHypothesisTest,
  verifyInvestigation,
  qualifyInvestigation,
} = require('./learningPipelineService');

const {
  createSecurityLearningStore,
  buildDomainFingerprints,
  commitToOntogenesisMemory,
} = require('./ontogenesisMemoryBridge');

const {
  evaluateControlledReuse,
  evaluateAlertConfidenceWithHistory,
  validateSecurityPolicyModification,
} = require('./controlledReuseAndPolicyGate');

async function runFullSecurityLearningCycle(store, cycleInput = {}, options = {}) {
  const session = createLearningSession(options);
  recordObservation(session, cycleInput.observation);
  formulateHypothesis(session, cycleInput.hypothesis);
  await executeHypothesisTest(session, cycleInput.test);
  verifyInvestigation(session, cycleInput.verification);
  qualifyInvestigation(session, cycleInput.qualification);
  const memoryRecord = await commitToOntogenesisMemory(session, store, options);
  const reuseReceipt = cycleInput.reuse
    ? evaluateControlledReuse(session, store, cycleInput.reuse)
    : null;
  return Object.freeze({
    sessionId: session.sessionId,
    stageHistory: Object.freeze([...session.stageHistory]),
    observation: session.observation,
    hypothesis: session.hypothesis,
    testRecord: session.testRecord,
    verification: session.verification,
    qualification: session.qualification,
    memoryRecord,
    reuseReceipt,
  });
}

module.exports = {
  LEARNING_STAGES,
  QUALIFICATION_DISPOSITIONS,
  learningError,
  sha256Prefixed,
  assertStageTransition,
  verifyArtifactWithGvx,
  issueIndependentVerifierReceipt,
  isReceiptTrustedAndValid,
  createLearningSession,
  recordObservation,
  formulateHypothesis,
  executeHypothesisTest,
  verifyInvestigation,
  qualifyInvestigation,
  createSecurityLearningStore,
  buildDomainFingerprints,
  commitToOntogenesisMemory,
  evaluateControlledReuse,
  evaluateAlertConfidenceWithHistory,
  validateSecurityPolicyModification,
  runFullSecurityLearningCycle,
};
