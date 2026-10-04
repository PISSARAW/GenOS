'use strict';

const { createPublicKey, verify } = require('node:crypto');

const NONCE = /^[A-Za-z0-9._:-]{16,128}$/;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function publicKeyOf(pem) {
  if (typeof pem !== 'string' || pem.length > 4096) throw new TypeError('SHEV Ed25519 public key required.');
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new TypeError('SHEV authority must use Ed25519.');
  return key;
}

function authorizationPayload(input) {
  return { operation: input.operation, projectId: input.projectId,
    subjectId: input.subjectId, expectedVersion: input.expectedVersion,
    details: canonical(input.details), nonce: input.nonce, expiresAt: input.expiresAt };
}

async function verifyAuthorization(db, input) {
  if (!NONCE.test(input?.nonce) || !Number.isFinite(Date.parse(input.expiresAt))
    || Date.parse(input.expiresAt) <= Date.now()
    || typeof input.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(input.signature)) {
    throw new Error('SHEV authorization is missing, expired or malformed.');
  }
  const row = await db.get(`SELECT authority_public_key FROM shev_responsibilities
    WHERE project_id = ? AND status = 'active'`, [input.projectId]);
  if (!row?.authority_public_key) throw new Error('SHEV project has no enrolled authority key.');
  const payload = JSON.stringify(authorizationPayload(input));
  if (!verify(null, Buffer.from(payload), publicKeyOf(row.authority_public_key),
    Buffer.from(input.signature, 'base64'))) throw new Error('SHEV authority signature is invalid.');
  return payload;
}

async function consumeAuthorization(db, input) {
  const payload = await verifyAuthorization(db, input);
  await db.run(`INSERT INTO shev_authorizations (nonce, project_id, operation, payload_json, signature)
    VALUES (?, ?, ?, ?, ?)`, [input.nonce, input.projectId, input.operation, payload, input.signature]);
}

module.exports = { authorizationPayload, publicKeyOf, verifyAuthorization, consumeAuthorization };
