'use strict';

const VARIANTS = Object.freeze({
  balanced: { migration: 'complementary', quorumRatio: 0.5, preserveDiversity: true },
  resilient: { migration: 'rescue', quorumRatio: 0.6, preserveDiversity: true },
  exploratory: { migration: 'novelty', quorumRatio: 0.4, preserveDiversity: true },
  conservative: { migration: 'counterexample', quorumRatio: 0.7, preserveDiversity: false }
});
const CLASSIFICATIONS = Object.freeze(['PUBLIC', 'REGIONAL', 'SENSITIVE', 'LOCAL_ONLY']);

function resolveMetapopulationVariant(input = {}) {
  const name = input.variant || 'balanced';
  const policy = VARIANTS[name];
  if (!policy) throw policyError('METAPOPULATION_VARIANT_UNKNOWN', 'Unknown metapopulation variant.');
  return { variant: name, policy: { ...policy }, scope: input.scope || 'mission',
    persistent: ['workspace', 'project', 'persistent'].includes(input.scope) };
}

function authorizeFederationTransfer(input = {}) {
  const classification = String(input.classification || 'LOCAL_ONLY').toUpperCase();
  if (!CLASSIFICATIONS.includes(classification)) throw policyError('METAPOPULATION_CLASSIFICATION_INVALID', 'Unknown data classification.');
  const allowed = isFederationTransferAllowed(input, classification);
  return { allowed, classification, sourceRegion: input.sourceRegion || null,
    targetRegion: input.targetRegion || null, reason: allowed ? 'SOVEREIGNTY_POLICY_SATISFIED' : 'SOVEREIGNTY_POLICY_DENIED',
    transferableRefs: allowed ? (input.refs || []) : [] };
}

function assessResidentLease(input = {}) {
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const expiry = Date.parse(input.expiresAt || '');
  const persistent = ['workspace', 'project', 'persistent'].includes(input.scope);
  const valid = isLeaseValid(input);
  return { daemonId: input.daemonId || null, valid, scope: input.scope || 'mission',
    expiresAt: Number.isFinite(expiry) ? new Date(expiry).toISOString() : null,
    reason: valid ? 'LEASE_ACTIVE' : persistent ? 'LEASE_EXPIRED_OR_UNPROVEN' : 'SCOPE_NOT_RESIDENT' };
}

function isFederationTransferAllowed(input, classification) {
  const trustedRegion = Boolean(input.sourceRegion && input.sourceRegion === input.targetRegion);
  return classification === 'PUBLIC' || classification === 'REGIONAL' && (trustedRegion || input.federationAgreement === true);
}

function isLeaseValid(input) {
  const persistent = ['workspace', 'project', 'persistent'].includes(input.scope);
  const expiry = Date.parse(input.expiresAt || '');
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  return persistent && Boolean(input.daemonId) && Number.isFinite(expiry) && expiry > now && input.heartbeatStatus === 'ACTIVE';
}

function policyError(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { resolveMetapopulationVariant, authorizeFederationTransfer, assessResidentLease, VARIANTS };
