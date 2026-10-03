'use strict';
const crypto = require('node:crypto');
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
  const fields = Array.isArray(propagule.fields) ? [...new Set(propagule.fields.map(String))].sort() : [];
  const limit = contract?.dataMinimization?.maxFields;
  if (!Number.isSafeInteger(limit) || limit < 0) throw Object.assign(new Error('Federation minimization limit is invalid.'), { code: 'METAPOPULATION_FEDERATION_CONTRACT_INVALID' });
  const redacted = contract.dataMinimization.redact === true ? fields.slice(0, limit) : fields;
  const proofPayload = { propaguleId: propagule.propaguleId, sourceRegion: propagule.sourceRegion,
    targetRegion: propagule.targetRegion, contractId: contract.contractId, originalFields: fields, transferredFields: redacted };
  const proofId = crypto.createHash('sha256').update(JSON.stringify(proofPayload)).digest('hex');
  return {
    originalFieldCount: fields.length,
    transferredFieldCount: redacted.length,
    redacted, proofId,
    minimized: redacted.length < fields.length,
    withinPolicy: redacted.length <= limit,
    contractId: contract.contractId
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
  if (contract.active !== true) return { allowed: false, reason: 'CONTRACT_INACTIVE' };
  if (!Array.isArray(contract.allowedClassifications)) return { allowed: false, reason: 'CONTRACT_CLASSIFICATIONS_INVALID' };
  if (!contract.allowedClassifications.includes(classification)) return { allowed: false, reason: 'CLASSIFICATION_NOT_ALLOWED' };
  const proof = proofOfDataMinimization(propagule, contract);
  if (!proof.withinPolicy) return { allowed: false, reason: 'DATA_MINIMIZATION_FAILED' };
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
