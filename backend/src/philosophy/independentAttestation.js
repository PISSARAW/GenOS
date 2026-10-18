'use strict';

const { digest, contractFingerprint } = require('./contractFingerprint');
const representative = require('./representativeMissionExperiments');
const organizations = require('./organizationMissionExperiments');
const { validateReceipt } = require('../services/epistemicVerifierReceiptService');
const { listVerifierDigests } = require('../services/verifierTrustRegistry');
const { evaluateIndependence } = require('../services/epistemicScheduler/independencePolicy');

const EVIDENCE_TYPES = Object.freeze([
  'organization-comparison-receipt', 'representative-mission-receipt', 'runtime-receipt',
]);

function missionFor(contract) {
  const mission = representative.listRepresentativeMissions()
    .find((item) => item.contractIds.includes(contract.id));
  if (!mission) throw new Error('Contract has no representative philosophy mission');
  return mission;
}

function producerDescriptor(contract, missionId) {
  return {
    actorId: 'genos-philosophy-runtime', model: 'genos-node', version: '1',
    strategy: 'representative-and-organization-replay',
    evidenceSource: `philosophy:${contract.id}:${missionId}`,
    workspaceId: 'local-philosophy-runtime',
  };
}

function runRuntimeEvidence(contract, contracts) {
  const mission = missionFor(contract);
  const representativeReceipt = representative.runRepresentativeMission(contracts, mission.id);
  const organizationReceipt = organizations.runOrganizationComparison(contracts, mission.id);
  const payload = {
    apiVersion: 'genos.philosophy-runtime-evidence/v1', kind: 'runtime-receipt',
    contractId: contract.id, contractHash: contractFingerprint(contract), missionId: mission.id,
    producer: producerDescriptor(contract, mission.id), representativeReceipt, organizationReceipt,
    passed: representativeReceipt.passed && organizationReceipt.passed,
    actualMissionExecution: true, actualOrganizationExecution: true,
    actualWorkerDispatch: false, actualTopologyExecution: false,
    externalFactsVerified: false, independentValidation: false,
  };
  return { ...payload, receiptHash: digest(payload), promotionEligible: false };
}

function payloadOf(receipt) {
  const { receiptHash, promotionEligible, ...payload } = receipt;
  return payload;
}

function runtimeBoundaries(receipt, contract) {
  const expected = {
    kind: 'runtime-receipt', contractId: contract.id, contractHash: contractFingerprint(contract),
    passed: true, actualMissionExecution: true, actualOrganizationExecution: true,
    actualWorkerDispatch: false, actualTopologyExecution: false,
    externalFactsVerified: false, independentValidation: false, promotionEligible: false,
  };
  return Boolean(receipt) && Object.entries(expected).every(([key, value]) => receipt[key] === value);
}

function verifyRuntimeEvidence(receipt, contract, contracts) {
  if (!runtimeBoundaries(receipt, contract) || receipt.receiptHash !== digest(payloadOf(receipt))) return false;
  if (!Array.isArray(contracts) || !contracts.length) return false;
  const representativeValid = representative.verifyRepresentativeMission(receipt.representativeReceipt, contracts);
  const organizationValid = organizations.verifyOrganizationComparison(receipt.organizationReceipt, contracts);
  return representativeValid && organizationValid
    && receipt.missionId === receipt.representativeReceipt.missionId
    && receipt.missionId === receipt.organizationReceipt.missionId;
}

function attestationRequest(contract, runtimeReceipt) {
  const binding = {
    contractId: contract.id, contractHash: contractFingerprint(contract),
    runtimeReceiptHash: runtimeReceipt.receiptHash,
  };
  return {
    resultId: `philosophy-attestation:${runtimeReceipt.receiptHash}`,
    evidenceDigest: `sha256:${digest(binding)}`,
    coveredObligations: [`contract:${contract.id}:runtime-evidence`],
    evidenceTypes: [...EVIDENCE_TYPES],
  };
}

function sameStrings(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && [...left].sort().join('\0') === [...right].sort().join('\0');
}

function verifierReceiptValid(contract, runtimeReceipt, verifierReceipt) {
  const request = attestationRequest(contract, runtimeReceipt);
  if (!validateReceipt(verifierReceipt, listVerifierDigests())) return false;
  if (verifierReceipt.status !== 'verified' || verifierReceipt.independent !== true) return false;
  if (verifierReceipt.resultId !== request.resultId || verifierReceipt.evidenceDigest !== request.evidenceDigest) return false;
  if (!sameStrings(verifierReceipt.coveredObligations, request.coveredObligations)) return false;
  if (!sameStrings(verifierReceipt.evidenceTypes, request.evidenceTypes)) return false;
  try {
    const independence = evaluateIndependence(verifierReceipt.independenceDescriptor, [runtimeReceipt.producer]);
    return independence.independent && verifierReceipt.independenceDistance === independence.distance;
  } catch {
    return false;
  }
}

function admitIndependentAttestation(contract, input) {
  const { runtimeReceipt, verifierReceipt, contracts } = input || {};
  if (!verifyRuntimeEvidence(runtimeReceipt, contract, contracts)) throw new Error('Runtime philosophy receipt is invalid');
  if (!verifierReceiptValid(contract, runtimeReceipt, verifierReceipt)) throw new Error('Independent philosophy receipt is invalid');
  const payload = {
    apiVersion: 'genos.philosophy-independent-attestation/v1', kind: 'independent-receipt',
    contractId: contract.id, contractHash: contractFingerprint(contract),
    runtimeReceiptHash: runtimeReceipt.receiptHash, verifierReceipt,
    independentValidation: true, externalFactsVerified: false,
    actualWorkerDispatch: false, actualTopologyExecution: false,
  };
  return { ...payload, receiptHash: digest(payload), promotionEligible: false };
}

function independentBoundaries(receipt, contract) {
  const expected = {
    kind: 'independent-receipt', contractId: contract.id, contractHash: contractFingerprint(contract),
    independentValidation: true, externalFactsVerified: false, promotionEligible: false,
  };
  return Boolean(receipt) && Object.entries(expected).every(([key, value]) => receipt[key] === value);
}

function verifyIndependentAttestation(receipt, contract, context) {
  if (!independentBoundaries(receipt, contract)) return false;
  if (receipt.receiptHash !== digest(payloadOf(receipt))) return false;
  const runtimeReceipt = (context.evidence || []).find((item) => item?.kind === 'runtime-receipt'
    && item.receiptHash === receipt.runtimeReceiptHash);
  return verifyRuntimeEvidence(runtimeReceipt, contract, context.contracts)
    && verifierReceiptValid(contract, runtimeReceipt, receipt.verifierReceipt);
}

module.exports = { runRuntimeEvidence, verifyRuntimeEvidence, attestationRequest,
  admitIndependentAttestation, verifyIndependentAttestation };
