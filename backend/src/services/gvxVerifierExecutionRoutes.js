'use strict';

const crypto = require('node:crypto');
const { hash, error, sameScope } = require('./gvxContracts');

function signed(config, receipt) {
  return { receipt, signature: crypto.sign(null, Buffer.from(JSON.stringify(receipt)), config.privateKey).toString('base64') };
}

async function handle(config, endpoint, input) {
  const evaluator = config.evaluator;
  if (endpoint === '/v1/evaluate') return signed(config, await evaluator.evaluate(input));
  const profile = evaluator.descriptor(input.profileId);
  if (!sameScope(input.scope, profile.scope)) throw error('GVX_EXECUTION_SCOPE_MISMATCH');
  if (endpoint === '/v1/profile') return signed(config, { schema: 'genos.gvx.execution-profile-descriptor/v1',
    profile, verifiers: require('./verifierTrustRegistry').listVerifiers() });
  const privateProfile = evaluator.profiles.find((item) => item.id === profile.id);
  const allowed = privateProfile.allowedActions?.includes(input.action) === true
    && ['gvx.somatic.apply', 'gvx.somatic.rollback'].includes(input.action)
    && input.parentHash === profile.parentHash && input.candidateHash === profile.candidateHash;
  return signed(config, { schema: 'genos.gvx.authorization/v1', allowed, action: input.action,
    scope: input.scope, entityId: input.scope.entityId, parentHash: profile.parentHash,
    candidateHash: profile.candidateHash, profileId: profile.id,
    approvalId: hash({ profile: profile.profileHash, action: input.action, scope: input.scope }),
    checkedAt: new Date().toISOString() });
}

module.exports = { handle };
