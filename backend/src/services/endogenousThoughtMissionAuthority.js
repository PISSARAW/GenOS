'use strict';

const crypto = require('node:crypto');
const { authorizationPayload } = require('./shev/authorityService');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const contract = require('./endogenousThoughtMissionContract');
const processes = require('./endogenousThoughtMissionSandbox');

async function assertEnrolled(db, input) {
  const responsibility = await require('./shev/responsibilityService').getResponsibility(db, input.projectId);
  if (!responsibility?.authorityPublicKey || responsibility.status !== 'active') throw contract.fail('ETT_MISSION_AUTHORITY_REQUIRED');
  if (!responsibility.mandate.dimensions.some(item => item.name === input.dimension)) throw contract.fail('ETT_MISSION_DIMENSION_REQUIRED');
  let publicKey;
  try { publicKey = crypto.createPublicKey(input.authority.privateKey); }
  catch (_) { throw contract.fail('ETT_MISSION_AUTHORITY_KEY_REQUIRED'); }
  const actual = publicKey.export({ type: 'spki', format: 'der' });
  const expected = crypto.createPublicKey(responsibility.authorityPublicKey).export({ type: 'spki', format: 'der' });
  if (!actual.equals(expected)) throw contract.fail('ETT_MISSION_AUTHORITY_MISMATCH');
  if (!input.authority.grantedBy || input.authority.grantedBy === input.agentId) throw contract.fail('ETT_MISSION_GRANTOR_REQUIRED');
  return responsibility;
}
function signer(input) {
  return async ({ stage, ...material }) => {
    const unsigned = { ...material, nonce: `ett-mission-${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + input.budget.seconds * 1000 + 60000).toISOString() };
    return { ...unsigned, signature: crypto.sign(null, Buffer.from(JSON.stringify(authorizationPayload(unsigned))),
      input.authority.privateKey).toString('base64') };
  };
}
function verifier(input, runtime, snapshot) {
  const keys = crypto.generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const authorize = signer(input);
  const proofs = [];
  async function verify(request) {
    const record = runtime.recordFor(request.runReceipt);
    if (!record) throw contract.fail('ETT_MISSION_EXECUTION_PROOF_REQUIRED');
    const oracle = processes.verify(snapshot, record.measurement, input.executionDeadlineAt);
    if (oracle.verdict === 'inconclusive') throw contract.fail('ETT_MISSION_ORACLE_DISAGREEMENT');
    const oracleRef = `ett-oracle:${contract.digest(oracle)}`;
    const verification = { verifierId: `ett-structural-oracle:${oracle.programDigest.slice(0, 16)}`, publicKey,
      verdict: oracle.verdict, oracleRef, evidenceRefs: [request.runReceipt.receiptId, oracleRef, record.evidenceRef],
      verifiedAt: new Date(Math.max(Date.now(), Date.parse(request.runReceipt.payload.completedAt))).toISOString(),
      nonce: `ett-attestation-${crypto.randomUUID()}`, signature: '' };
    const material = { operation: 'ett-verify', projectId: input.projectId,
      subjectId: request.runReceipt.payload.runId, expectedVersion: request.expectedVersion,
      details: { episodeId: input.episodeId, runRef: request.runReceipt.receiptId,
        verifierId: verification.verifierId,
        verifierKeyDigest: request.verificationContract.publicKeyDigest(publicKey),
        policyId: request.policy.id, oracleRef } };
    const authorization = await authorize({ stage: 'verify', ...material });
    const payload = request.buildPayload({ projectId: input.projectId, episodeId: input.episodeId,
      policyId: request.policy.id, runReceipt: request.runReceipt, verification,
      authorizationRef: `shev-authorization:${authorization.nonce}` });
    verification.signature = crypto.sign(null, Buffer.from(canonicalJson(request.verificationContract.attestationMaterial(payload))),
      keys.privateKey).toString('base64');
    proofs.push({ measurement: record.measurement, oracle, evidenceRef: record.evidenceRef, oracleRef });
    return { authorization, verification };
  }
  return { verify, proofs };
}

module.exports = { assertEnrolled, signer, verifier };
