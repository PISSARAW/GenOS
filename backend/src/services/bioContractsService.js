'use strict';

const SCHEMA_VERSION = '1.0.0';
const SCHEMA_MAJOR = '1';
const ORIGINS = ['simulated', 'local', 'external'];

function majorOf(version) {
  return String(version || '').split('.')[0];
}

function isCompatible(version) {
  return majorOf(version) === SCHEMA_MAJOR;
}

function checkCompatible(version) {
  if (!isCompatible(version)) {
    throw conflict(version);
  }
}

function conflict(version) {
  const err = new Error(`incompatible schema ${version} != ${SCHEMA_VERSION}`);
  err.code = 'BIO_SCHEMA_MISMATCH';
  return err;
}

function validateBudget(claim) {
  if (!claim || typeof claim !== 'object') {
    throw failure('budget invalide');
  }
  if (claim.reserved < 0) {
    throw failure('reserved negatif');
  }
  if (claim.consumed > claim.reserved) {
    throw failure('depassement budget');
  }
  if (claim.reserved > claim.ceiling) {
    throw failure('plafond depasse');
  }
}

function validateReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') {
    throw failure('recu invalide');
  }
  checkCompatible(receipt.schema_version);
  if (!receipt.proof) {
    throw failure('preuve manquante');
  }
  if (!ORIGINS.includes(receipt.effect_origin)) {
    throw failure('origine inconnue');
  }
}

function failure(message) {
  const err = new Error(message);
  err.code = 'BIO_CONTRACT_REJECTED';
  return err;
}

function buildReceipt(fields) {
  const receipt = {
    organism_id: fields.organism_id,
    agent_id: fields.agent_id,
    genome_id: fields.genome_id,
    episode_id: fields.episode_id,
    initial_state_hash: fields.initial_state_hash,
    effect_id: fields.effect_id,
    proof: fields.proof,
    effect_origin: fields.effect_origin,
    schema_version: SCHEMA_VERSION,
  };
  validateReceipt(receipt);
  return receipt;
}

module.exports = {
  SCHEMA_VERSION,
  isCompatible,
  checkCompatible,
  validateBudget,
  validateReceipt,
  buildReceipt,
};
