'use strict';

const { validateReceipt } = require('./epistemicVerifierReceiptService');
const { createFormalResult } = require('./formalResultService');

const SCHEMA = 'genos.mission-outcome/v1';
const SCHEMA_V2 = 'genos.mission-outcome/v2';
const STATUSES = Object.freeze(['verified', 'rejected', 'inconclusive', 'abstained']);
const SHA256 = /^sha256:[a-f0-9]{64}$/i;

function build(input, fallbackGoal) {
  if (!input) return null;
  const contract = {
    schema: SCHEMA_V2,
    goal: input.goal || fallbackGoal,
    obligations: input.obligations,
    statuses: [...STATUSES],
    ...(input.effectObservation ? { effectObservation: input.effectObservation } : {})
  };
  return validate(contract);
}

function validate(contract) {
  if (!contract || ![SCHEMA, SCHEMA_V2].includes(contract.schema)) {
    throw new Error(`mission_outcome.schema must be ${SCHEMA} or ${SCHEMA_V2}`);
  }
  if (typeof contract.goal !== 'string' || !contract.goal.trim()) throw new Error('mission_outcome.goal is required');
  validateObligations(contract);
  if (JSON.stringify(contract.statuses) !== JSON.stringify(STATUSES)) {
    throw new Error('mission_outcome.statuses must contain the four canonical verdicts');
  }
  if (contract.schema === SCHEMA_V2 && contract.effectObservation !== undefined) validateEffectObservation(contract.effectObservation);
  if (contract.schema !== SCHEMA_V2 && contract.effectObservation !== undefined) {
    throw new Error('mission_outcome.effectObservation requires schema v2');
  }
  return contract;
}

function validateObligations(contract) {
  const { obligations } = contract;
  if (!Array.isArray(obligations) || !obligations.length) {
    throw new Error('mission_outcome.obligations must be a nonempty array');
  }
  const ids = new Set();
  const statements = new Set();
  for (const obligation of obligations) {
    if (!hasRequiredObligationFields(obligation)) {
      throw new Error('Each mission outcome obligation requires an id and canonical statement');
    }
    if (ids.has(obligation.id)) throw new Error(`Duplicate mission outcome obligation '${obligation.id}'`);
    if (contract.schema === SCHEMA_V2) {
      if (statements.has(obligation.statement)) throw new Error('Duplicate mission outcome statement');
      validateOracle(obligation.oracle);
      statements.add(obligation.statement);
    }
    ids.add(obligation.id);
  }
}

function hasRequiredObligationFields(obligation) {
  return typeof obligation?.id === 'string' && Boolean(obligation.id.trim())
    && typeof obligation.statement === 'string' && Boolean(obligation.statement.trim());
}

function validOracleIdentity(oracle) {
  return typeof oracle?.domain === 'string' && Boolean(oracle.domain.trim())
    && typeof oracle.verifierDigest === 'string' && SHA256.test(oracle.verifierDigest);
}

function validOracleDomain(domain) {
  return typeof domain?.statement === 'string' && Boolean(domain.statement.trim())
    && Array.isArray(domain.constraints)
    && domain.constraints.every((item) => typeof item === 'string' && Boolean(item.trim()));
}

function validateOracle(oracle) {
  if (!validOracleIdentity(oracle) || !validOracleDomain(oracle.validityDomain)) {
    throw new Error('Each v2 obligation requires an oracle domain, verifierDigest and validityDomain');
  }
}

function validateEffectObservation(effectObservation) {
  if (!effectObservation || typeof effectObservation !== 'object') {
    throw new Error('mission_outcome.effectObservation must be an object');
  }
  if (typeof effectObservation.metric !== 'string' || !effectObservation.metric.trim()) {
    throw new Error('mission_outcome.effectObservation.metric is required');
  }
  if (typeof effectObservation.horizon !== 'string' || !effectObservation.horizon.trim()) {
    throw new Error('mission_outcome.effectObservation.horizon is required');
  }
  if (typeof effectObservation.environment !== 'string' || !effectObservation.environment.trim()) {
    throw new Error('mission_outcome.effectObservation.environment is required');
  }
}

function validResult(result) {
  return Boolean(result && typeof result.evidence?.digest === 'string'
    && /^sha256:[a-f0-9]{64}$/i.test(result.evidence.digest));
}

function acceptedReceipt(receipt, result, trusted) {
  return receipt && validResult(result)
    && receipt.resultId === result.resultId && receipt.status === 'verified'
    && receipt.evidenceDigest === result.evidence?.digest
    && Array.isArray(receipt.coveredObligations)
    && receipt.coveredObligations.includes(result.resultId)
    && receipt.independent === true && validateReceipt(receipt, trusted);
}

function verifierIdentity(receipt) {
  const strategy = receipt.executionEvidence?.[0]?.postconditions?.strategy;
  if (strategy) return `strategy:${strategy}`;
  const actor = receipt.independenceDescriptor?.actorId;
  return actor ? `actor:${actor}` : `verifier:${receipt.verifierDigest}`;
}

function hasIndependentQuorum(result, receipts, trusted) {
  const matching = receipts.filter((receipt) => acceptedReceipt(receipt, result, trusted));
  return new Set(matching.map((receipt) => receipt.nonce)).size >= 2
    && new Set(matching.map(verifierIdentity)).size >= 2;
}

function verifiedStatements(verification) {
  const evaluation = verification?.gateContext?.aeisEvaluation;
  if (evaluation?.allAccepted !== true) return new Set();
  const assembly = evaluation.assembly;
  const receipts = assembly?.verifications || [];
  const trusted = verification.gateContext.trustedVerifierDigests;
  if (!Array.isArray(assembly?.results) || !Array.isArray(receipts)) return new Set();
  return new Set(assembly.results.filter((result) => hasIndependentQuorum(result, receipts, trusted))
    .map((result) => result.canonicalStatement));
}

function validFormalResult(result, oracle) {
  try {
    const rebuilt = createFormalResult(result);
    const actualDomain = rebuilt.validityDomain;
    const expectedDomain = oracle.validityDomain;
    return rebuilt.resultId === result.resultId
      && rebuilt.semanticFingerprint === result.semanticFingerprint
      && rebuilt.evidence.digest === result.evidence?.digest
      && actualDomain.statement === expectedDomain.statement
      && JSON.stringify(actualDomain.constraints) === JSON.stringify([...expectedDomain.constraints].sort());
  } catch (_) { return false; }
}

function validNativeProof(verification, event) {
  const proof = verification?.proof;
  const attestation = proof?.attestation?.value;
  if (verification?.delegated || !attestation || attestation.schema !== 'genos.native-oracle-attestation/v1'
      || attestation.accepted !== true || attestation.runId !== event?.runId
      || !Number.isFinite(Date.parse(attestation.validUntil))
      || Date.now() >= Date.parse(attestation.validUntil)
      || proof.saved?.evaluation?.allAccepted !== true) return false;
  return true;
}

function verifiedV2Obligations(contract, verification, event) {
  if (!validNativeProof(verification, event)) return [];
  const proof = verification.proof;
  const results = proof.saved.evaluation.assembly?.results;
  const receipts = proof.saved.evaluation.assembly?.verifications;
  const trusted = proof.saved.manifest?.trustedDigests;
  if (!Array.isArray(results) || !Array.isArray(receipts) || !Array.isArray(trusted)) return [];
  return contract.obligations.filter((item) => {
    if (item.oracle.domain !== proof.attestation.value.domain
        || !trusted.includes(item.oracle.verifierDigest)) return false;
    return results.some((result) => result.canonicalStatement === item.statement
      && validFormalResult(result, item.oracle)
      && hasIndependentQuorum(result, receipts.filter((receipt) => receipt.verifierDigest === item.oracle.verifierDigest
        && receipt.executionEvidence?.[0]?.subject?.runId === event.runId), trusted));
  }).map((item) => item.id);
}

function evaluate(contract, verification, event) {
  if (!contract) return null;
  validate(contract);
  const declared = event?.payload?.missionOutcome?.status;
  if (declared === 'abstained' || event?.eventType === 'WORKER_NO_ANSWER_PROVEN') {
    return { status: 'abstained', goal: contract.goal, verifiedObligations: [],
      missingObligations: contract.obligations.map((item) => item.id) };
  }
  if (declared === 'rejected' || event?.payload?.evidenceReport?.outcome === 'failure') {
    return { status: 'rejected', goal: contract.goal, verifiedObligations: [],
      missingObligations: contract.obligations.map((item) => item.id) };
  }
  const verifiedObligations = contract.schema === SCHEMA_V2
    ? verifiedV2Obligations(contract, verification, event)
    : contract.obligations.filter((item) => verifiedStatements(verification).has(item.statement)).map((item) => item.id);
  const covered = new Set(verifiedObligations);
  const missingObligations = contract.obligations.filter((item) => !covered.has(item.id)).map((item) => item.id);
  return { status: missingObligations.length ? 'inconclusive' : 'verified', goal: contract.goal,
    verifiedObligations, missingObligations };
}

module.exports = { SCHEMA, SCHEMA_V2, STATUSES, build, validate, evaluate, validateEffectObservation };
