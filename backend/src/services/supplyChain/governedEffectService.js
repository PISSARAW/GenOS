'use strict';

const crypto = require('node:crypto');
const { canonicalValue, fingerprint } = require('../stateFingerprint');
const artifactIdentity = require('./artifactIdentityService');
const capabilityBroker = require('./pointOfEffectCapabilityService');

const RECEIPT_SCHEMA = 'genos.governed-effect-receipt/v1';

function refusal(code) {
  return Object.assign(new Error(code), { code });
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function create(options) {
  if (!options?.artifactIdentityKey) throw refusal('GOVERNANCE_ARTIFACT_KEY_REQUIRED');
  const broker = capabilityBroker.create({ secretResolver: options.secretResolver,
    effectAdapters: options.effectAdapters, now: options.now });
  const bindings = new Map();

  function prepare(input) {
    const admissionReceipt = artifactIdentity.admit({
      manifest: input.manifest,
      artifactBytes: input.artifactBytes,
      sbomBytes: input.sbomBytes,
      scope: input.scope,
      requestedCapabilities: input.requestedCapabilities,
      now: input.now
    }, options.artifactIdentityKey);
    const grant = broker.issue({
      agentId: input.agentId,
      scope: input.scope,
      action: input.action,
      destination: input.destination,
      effectId: input.effectId,
      secretRef: input.secretRef,
      artifactDigest: admissionReceipt.artifactDigest,
      ttlMs: input.ttlMs
    });
    bindings.set(grant.capabilityId, Object.freeze({
      admissionReceipt,
      capabilityTokenHash: tokenHash(grant.capabilityToken)
    }));
    return { admissionReceipt, grant };
  }

  async function execute(input) {
    const binding = bindings.get(input.capabilityId);
    if (!binding) throw refusal('GOVERNANCE_BINDING_UNKNOWN');
    if (binding.capabilityTokenHash !== tokenHash(input.capabilityToken || '')) {
      throw refusal('GOVERNANCE_CAPABILITY_MISMATCH');
    }
    if (binding.admissionReceipt.receiptHash !== input.admissionReceiptHash) {
      throw refusal('GOVERNANCE_ADMISSION_RECEIPT_MISMATCH');
    }
    bindings.delete(input.capabilityId);
    const effect = await broker.execute({
      capabilityToken: input.capabilityToken,
      agentId: input.agentId,
      scope: input.scope,
      action: input.action,
      destination: input.destination,
      artifactDigest: binding.admissionReceipt.artifactDigest,
      payload: input.payload
    });
    const body = canonicalValue({
      schema: RECEIPT_SCHEMA,
      capabilityId: input.capabilityId,
      artifactDigest: binding.admissionReceipt.artifactDigest,
      admissionReceiptHash: binding.admissionReceipt.receiptHash,
      effectReceiptHash: effect.receipt.receiptHash,
      agentId: input.agentId,
      scope: input.scope,
      action: input.action,
      destination: input.destination,
      authorizesPromotion: false
    });
    return {
      output: effect.output,
      admissionReceipt: binding.admissionReceipt,
      effectReceipt: effect.receipt,
      governanceReceipt: { ...body, receiptHash: fingerprint(body) }
    };
  }

  return Object.freeze({ prepare, execute });
}

module.exports = { RECEIPT_SCHEMA, create };
