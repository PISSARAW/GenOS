'use strict';

const { createPrivateKey, sign } = require('node:crypto');

const CLAIMS_SCHEMA = 'genos.neuro-glia-backend-authorization/v1';

function issueBackendProof(input) {
  const authorityId = String(process.env.GENOS_NEURO_GLIA_BACKEND_AUTHORITY_ID || '').trim();
  const privatePem = process.env.GENOS_NEURO_GLIA_BACKEND_PRIVATE_KEY_PEM;
  if (!authorityId || !privatePem) throw new Error('Neuro-glia backend signing authority is not configured.');
  const claims = signedClaims({ ...input, authorityId });
  const signature = sign(null, Buffer.from(JSON.stringify(claims)), createPrivateKey(privatePem));
  return { ...claims, signatureHex: signature.toString('hex') };
}

function signedClaims(input) {
  return {
    schema: CLAIMS_SCHEMA,
    authorityId: input.authorityId,
    principalId: input.principalId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    missionId: input.missionId.toLowerCase(),
    producerId: input.producerId.toLowerCase(),
    eventId: input.eventId.toLowerCase(),
    eventType: input.eventType,
    tick: input.tick,
    idempotencyKey: input.idempotencyKey,
    payloadSha256: input.payloadSha256,
  };
}

module.exports = { issueBackendProof, signedClaims };
