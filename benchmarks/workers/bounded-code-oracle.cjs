'use strict';

const { createHash } = require('node:crypto');
const { digest, identity } = require('../../backend/src/services/biologicalIntegrity');

const STRATEGIES = ['code_quotient', 'code_remainder'];
const CASE_COUNT = 264;

function verify(testCase, execution) {
  const completion = execution.result?.codeCompletion;
  const receipt = execution.receipt;
  return testCase.oracle?.path === 'codeCompletion.verified'
    && testCase.oracle.equals === true && missionCompleted(execution, receipt)
    && codeEvidenceValid(completion) && oracleAttestationValid(completion, receipt)
    && biologicalReceiptValid(receipt, execution.result.mission);
}

function missionCompleted(execution, receipt) {
  const mission = execution.result?.mission;
  return mission?.status === 'completed' && mission.terminalEvent === 'AGENT_COMPLETED'
    && mission.runId === receipt?.runId && mission.workerId === receipt?.workerId;
}

function codeEvidenceValid(completion) {
  const artifact = completion?.artifact;
  const expected = require('./cases.cjs').CODE_EXPRESSION;
  const hash = createHash('sha256').update(expected).digest('hex');
  return completion?.verified === true && /^ollama:\/\//.test(completion.model || '')
    && artifact?.path === 'src/answer.gexpr' && artifact.expression === expected
    && artifact.contentHash === hash && testsPassed(completion.tests)
    && verifierAccepted(completion.verifier, hash) && independentChecksPassed(completion.independentChecks, hash);
}

function testsPassed(tests) {
  return Array.isArray(tests) && tests.length > 0
    && tests.some((test) => test.command === 'npm test' && test.exitCode === 0);
}

function verifierAccepted(verifier, hash) {
  return verifier?.verdict === 'accept' && verifier.contractId === 'euclidean_modulo_v1'
    && verifier.artifactPath === 'src/answer.gexpr' && verifier.artifactContentHash === hash
    && verifier.evidence?.includes(`genos://code/${hash}`);
}

function independentChecksPassed(checks, hash) {
  return Array.isArray(checks) && checks.length === STRATEGIES.length
    && STRATEGIES.every((strategy) => checks.some((check) => check.strategy === strategy
      && check.status === 'verified' && check.artifactContentHash === hash
      && check.coverage?.complete === true && check.coverage.checkedCases === CASE_COUNT));
}

function oracleAttestationValid(completion, receipt) {
  const oracle = completion?.nativeOracle;
  return oracle?.accepted === true && oracle.domain === 'code_postconditions'
    && oracle.costs?.complete === true && oracle.costs.processes === 2
    && oracle.nonceCount === 2 && sameStrategies(oracle.strategies)
    && receipt.semanticVerification?.hash === oracle.hash
    && receipt.semanticVerification?.eventId === oracle.eventId
    && receipt.semanticVerification?.acceptanceHash === oracle.acceptanceHash;
}

function sameStrategies(strategies) {
  return Array.isArray(strategies) && strategies.length === STRATEGIES.length
    && STRATEGIES.every((strategy, index) => strategies[index] === strategy);
}

function biologicalReceiptValid(receipt, mission) {
  if (!receiptIdentityValid(receipt, mission) || !receiptEvidenceValid(receipt)) return false;
  const payload = { ...receipt };
  delete payload.payloadHash;
  return receipt.payloadHash === digest(payload);
}

function receiptIdentityValid(receipt, mission) {
  return receipt?.schema === 'genos.worker-biological-execution-receipt/v1'
    && receipt.result?.status === 'completed' && receipt.result.verified === true
    && receipt.receiptId === identity(['genos.worker-receipt/v1', receipt.runId])
    && receipt.runId === mission.runId && receipt.workerId === mission.workerId;
}

function receiptEvidenceValid(receipt) {
  return receipt.semanticVerification?.schema === 'genos.native-oracle-receipt-reference/v1'
    && receipt.semanticVerification.costs?.processes === 2
    && receipt.semanticVerification.costs.complete === true
    && receipt.accounting?.consistent === true
    && Array.isArray(receipt.evidence?.observations);
}

module.exports = { verify, biologicalReceiptValid };
