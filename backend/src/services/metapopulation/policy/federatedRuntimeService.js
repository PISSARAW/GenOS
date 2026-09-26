'use strict';
const CLASSIFICATIONS = ['PUBLIC', 'REGIONAL', 'SENSITIVE', 'LOCAL_ONLY'];

const regionalKeyStore = new Map();
const transferAuditLog = [];

function registerRegionalKey(regionId, keyMaterial) {
  regionalKeyStore.set(regionId, { keyId: `rk-${regionId}-${Date.now()}`, regionId, createdAt: new Date().toISOString() });
}

function createCrossRegionContract(context) {
  const { sourceRegion, targetRegion, allowedClassifications, dataMinimization } = context;
  return {
    contractId: `crc-${sourceRegion}-${targetRegion}-${Date.now()}`,
    sourceRegion,
    targetRegion,
    allowedClassifications: allowedClassifications || ['PUBLIC'],
    dataMinimization: dataMinimization || { redact: true, maxFields: 5 },
    createdAt: new Date().toISOString(),
    active: true,
  };
}

function proofOfDataMinimization(propagule, contract) {
  const fields = propagule.fields || [];
  const redacted = contract?.dataMinimization?.redact ? fields.slice(0, contract.dataMinimization.maxFields) : fields;
  return {
    originalFieldCount: fields.length,
    transferredFieldCount: redacted.length,
    redacted: redacted,
    proofId: `pdm-${propagule.propaguleId}-${Date.now()}`,
    minimized: redacted.length < fields.length,
  };
}

function receiverAttestation(context) {
  const { targetRegion, propaguleId, accepted, reason } = context;
  const entry = { propaguleId, targetRegion, accepted, reason, attestedAt: new Date().toISOString() };
  transferAuditLog.push(entry);
  return entry;
}

function authorizeFederatedTransfer(context) {
  const { propagule, sourceRegion, targetRegion, contracts } = context;
  const classification = (propagule.classification || 'LOCAL_ONLY').toUpperCase();
  if (!CLASSIFICATIONS.includes(classification)) return { allowed: false, reason: 'INVALID_CLASSIFICATION' };
  const contract = contracts?.find((c) => c.sourceRegion === sourceRegion && c.targetRegion === targetRegion);
  if (!contract) return { allowed: false, reason: 'NO_CONTRACT' };
  if (!contract.allowedClassifications.includes(classification)) return { allowed: false, reason: 'CLASSIFICATION_NOT_ALLOWED' };
  const proof = proofOfDataMinimization(propagule, contract);
  return { allowed: true, classification, contractId: contract.contractId, proof, reason: 'SOVEREIGNTY_SATISFIED' };
}

function planFederatedProofActions(candidates, contracts) {
  const actions = [];
  for (const candidate of candidates || []) {
    const proof = proofForCandidate(candidate, contracts);
    if (proof) actions.push(proof);
  }
  return actions;
}

function proofForCandidate(candidate, contracts) {
  const contract = (contracts || []).find((item) => item.sourceRegion === candidate.sourceRegion && item.targetRegion === candidate.targetRegion);
  if (!contract) return null;
  const proof = proofOfDataMinimization(candidate, contract);
  return { type: 'PROOF_OF_DATA_MINIMIZATION', propaguleId: candidate.propaguleId, proofId: proof.proofId, proof, contractId: contract.contractId };
}

module.exports = { registerRegionalKey, createCrossRegionContract, proofOfDataMinimization, receiverAttestation, authorizeFederatedTransfer, planFederatedProofActions, CLASSIFICATIONS };
