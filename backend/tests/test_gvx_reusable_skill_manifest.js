'use strict';

const assert = require('assert');
const skills = require('../src/services/gvxReusableSkillManifest');

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function manifestInput() {
  return {
    skillId: 'research.synthesis', version: '2.1.0', artifactHash: HASH_A,
    sourceDomain: 'software', requestedPermissions: ['browser.read', 'memory.write'],
    provenance: { repositoryCommit: 'c'.repeat(40),
      transformationEventIds: ['transform-1'], evidenceEventIds: ['evidence-2', 'evidence-1'] },
    rollbackTarget: { version: '2.0.0', artifactHash: HASH_B }
  };
}

const manifest = skills.sealSkillManifest(manifestInput());
assert.equal(skills.verifySkillManifest(manifest), true);
assert.deepEqual(manifest.provenance.evidenceEventIds, ['evidence-1', 'evidence-2']);
assert.throws(() => skills.sealSkillManifest({ ...manifestInput(), provenance: null }), {
  code: 'GVX_SKILL_MANIFEST_INVALID'
});
assert.equal(skills.verifySkillManifest({ ...manifest, version: '2.1.1' }), false);

function lease(overrides = {}) {
  return { skillId: manifest.skillId, version: manifest.version, manifestHash: manifest.manifestHash,
    leaseId: 'lease-1', approvalId: 'approval-1', permissions: ['browser.read', 'memory.write'],
    expiresAt: '2035-01-01T00:00:00.000Z', ...overrides };
}

assert.deepEqual(skills.authorizeSkillManifest(manifest, lease(), Date.parse('2030-01-01')), {
  allowed: true, approvalId: 'approval-1', leaseId: 'lease-1'
});
assert.equal(skills.authorizeSkillManifest(manifest, null).allowed, false);
assert.deepEqual(skills.authorizeSkillManifest(manifest, lease({ permissions: ['browser.read'] }),
  Date.parse('2030-01-01')), {
  allowed: false, reason: 'skill-permission-denied', missingPermissions: ['memory.write']
});
assert.equal(skills.authorizeSkillManifest(manifest, lease({ expiresAt: '2029-01-01T00:00:00.000Z' }),
  Date.parse('2030-01-01')).allowed, false);

console.log('GVX reusable skill manifest checks passed.');
