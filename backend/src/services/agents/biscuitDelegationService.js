'use strict';

const DENIED = 'BISCUIT_DELEGATION_DENIED';

function deny() {
  return Object.assign(new Error('Delegation capability is invalid or outside its scope.'), { code: DENIED });
}

function requireIdentifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw deny();
  return value;
}

async function biscuitApi() {
  return import('@biscuit-auth/biscuit-wasm');
}

async function issueDelegation(input, privateKeyHex) {
  const { Biscuit, PrivateKey } = await biscuitApi();
  const agentId = requireIdentifier(input.agentId);
  const childKinds = input.childKinds;
  if (!Array.isArray(childKinds) || childKinds.length === 0) throw deny();
  const expiresAt = Number(input.expiresAt);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) throw deny();
  const builder = Biscuit.builder();
  for (const kind of childKinds) builder.addCode(`right(${JSON.stringify(agentId)}, ${JSON.stringify(requireIdentifier(kind))});`);
  builder.addCode(`expires_at(${expiresAt});`);
  return builder.build(PrivateKey.fromString(privateKeyHex)).toBase64();
}

async function attenuateDelegation(tokenString, childKind, publicKeyHex) {
  const { Biscuit, PublicKey } = await biscuitApi();
  const kind = requireIdentifier(childKind);
  const token = Biscuit.fromBase64(tokenString, PublicKey.fromString(publicKeyHex));
  const block = Biscuit.block_builder();
  block.addCode(`check if requested_kind(${JSON.stringify(kind)});`);
  return token.appendBlock(block).toBase64();
}

async function verifyDelegation(input) {
  try {
    const { Biscuit, PublicKey } = await biscuitApi();
    const agentId = requireIdentifier(input.agentId);
    const childKind = requireIdentifier(input.childKind);
    const token = Biscuit.fromBase64(input.token, PublicKey.fromString(input.publicKeyHex));
    if (token.getRevocationIdentifiers().some((id) => input.revokedIds?.includes(id))) throw deny();
    const authorizer = token.getAuthorizer();
    authorizer.addCode(`requested_kind(${JSON.stringify(childKind)});`);
    authorizer.addCode(`allow if right(${JSON.stringify(agentId)}, ${JSON.stringify(childKind)}), expires_at($expiry), $expiry > ${Date.now()};`);
    authorizer.authorizeWithLimits({ max_facts: 100, max_iterations: 10, max_time_micro: 5000000 });
    return { authorized: true, revocationIds: token.getRevocationIdentifiers() };
  } catch (_) {
    throw deny();
  }
}

module.exports = { issueDelegation, attenuateDelegation, verifyDelegation, DENIED };
