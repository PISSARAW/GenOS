'use strict';

const assert = require('assert');
const manifests = require('../src/services/gvxReusableSkillManifest');
const { evaluateSkillRelease } = require('../src/services/gvxReusableSkillGate');

const hashes = 'abcdef'.split('').map((value) => value.repeat(64));
const manifest = manifests.sealSkillManifest({
  skillId: 'research.synthesis', version: '2.1.0', artifactHash: hashes[0], sourceDomain: 'software',
  provenance: { repositoryCommit: '1'.repeat(40), transformationEventIds: ['t-1'], evidenceEventIds: ['e-1'] },
  requestedPermissions: ['browser.read'], rollbackTarget: { version: '2.0.0', artifactHash: hashes[1] }
});

function evidence(domain, artifactHash, verifierId, overrides = {}) {
  return { domain, split: 'held_out', metric: 'verified-benefit', direction: 'higher',
    baseline: 0.4, candidate: 0.7, artifactHash, verifierId, independent: true, ...overrides };
}

function validInput() {
  return {
    manifest, now: Date.parse('2030-01-01'),
    lease: { skillId: manifest.skillId, version: manifest.version, manifestHash: manifest.manifestHash,
      leaseId: 'lease-1', approvalId: 'approval-1', permissions: ['browser.read'],
      expiresAt: '2031-01-01T00:00:00.000Z' },
    heldOutTrials: [evidence('software', hashes[2], 'verifier-a'),
      evidence('mathematics', hashes[3], 'verifier-b')],
    responsibility: { ownerKind: 'external', ownerId: 'product-owner',
      obligationId: 'objective-42', metric: 'verified-benefit' },
    externalBenefit: evidence('production', hashes[4], 'external-verifier',
      { responsibilityId: 'objective-42' }),
    regressionWindows: [
      evidence('production', hashes[0], 'monitor-a', { contextHash: '2'.repeat(64), regression: false }),
      evidence('production', hashes[1], 'monitor-b', { contextHash: '3'.repeat(64), regression: false })
    ]
  };
}

const ready = evaluateSkillRelease(validInput());
assert.equal(ready.status, 'ready_for_promotion_review');
assert.equal(ready.automaticPromotion, false);
assert.equal(ready.promotionAuthority, 'none');
assert.deepEqual(ready.assessments.transfer.domains, ['mathematics', 'software']);

const noLease = evaluateSkillRelease({ ...validInput(), lease: null });
assert.equal(noLease.status, 'blocked');
assert.ok(noLease.reasons.includes('skill-lease-invalid'));

const sameDomain = validInput();
sameDomain.heldOutTrials = sameDomain.heldOutTrials.map((trial) => ({ ...trial, domain: 'software' }));
assert.ok(evaluateSkillRelease(sameDomain).reasons.includes('cross-domain-transfer-required'));

const unowned = validInput();
unowned.externalBenefit = { ...unowned.externalBenefit, responsibilityId: 'objective-other' };
assert.ok(evaluateSkillRelease(unowned).reasons.includes('external-benefit-evidence-invalid'));

const regressed = validInput();
regressed.regressionWindows[1] = { ...regressed.regressionWindows[1], candidate: 0.2, regression: true };
const rollback = evaluateSkillRelease(regressed);
assert.equal(rollback.status, 'rollback_required');
assert.equal(rollback.rollback.automatic, false);
assert.equal(rollback.rollback.requiresAuthorization, true);
assert.deepEqual(rollback.rollback.target, manifest.rollbackTarget);

console.log('GVX reusable skill promotion gate checks passed.');
