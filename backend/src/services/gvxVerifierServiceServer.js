'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const registry = require('./gvxVerifierRegistry');
const implementationRegistry = require('./gvxVerifierControlPlaneRegistry');
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;

function loadConfiguredImplementations() {
  const modulePath = process.env.GENOS_GVX_VERIFIER_MODULE;
  if (!modulePath) return;
  const absolute = path.resolve(modulePath);
  const expected = String(process.env.GENOS_GVX_VERIFIER_MODULE_SHA256 || '').toLowerCase();
  const observed = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(expected) || expected !== observed) {
    throw serviceError('GVX_VERIFIER_MODULE_DIGEST_MISMATCH');
  }
  const plugin = require(absolute);
  if (typeof plugin.register !== 'function') throw serviceError('GVX_VERIFIER_MODULE_INVALID');
  plugin.register({ registerVerifierImplementation: implementationRegistry.registerVerifierImplementation,
    registerVerifier: require('./verifierTrustRegistry').registerVerifier });
}

function serviceConfig() {
  const token = String(process.env.GENOS_GVX_VERIFIER_TOKEN || '');
  const keyFile = process.env.GENOS_GVX_VERIFIER_PRIVATE_KEY_FILE;
  require('./gvxExecutionIsolation').validateSigningKey(keyFile);
  const privateKeyPem = keyFile ? fs.readFileSync(path.resolve(keyFile), 'utf8')
    : String(process.env.GENOS_GVX_VERIFIER_PRIVATE_KEY || '');
  if (token.length < 32 || !privateKeyPem) throw serviceError('GVX_VERIFIER_SERVICE_CREDENTIALS_REQUIRED');
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'ed25519') throw serviceError('GVX_VERIFIER_ED25519_KEY_REQUIRED');
  const publicKey = crypto.createPublicKey(privateKey);
  const keyId = `sha256:${crypto.createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex')}`;
  return { token, privateKey, publicKey, keyId };
}

function serviceError(code) { return Object.assign(new Error(code), { code }); }

function parseRequest(body) {
  try { return JSON.parse(body); } catch (_) { throw serviceError('GVX_VERIFIER_REQUEST_INVALID'); }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(serviceError('GVX_VERIFIER_REQUEST_TOO_LARGE'));
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function authorized(request, token) {
  const supplied = Buffer.from(String(request.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function artifactBytes(encoded) {
  if (typeof encoded !== 'string' || encoded.length > MAX_REQUEST_BYTES * 1.34) throw serviceError('GVX_VERIFIER_ARTIFACT_INVALID');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.toString('base64') !== encoded) throw serviceError('GVX_VERIFIER_ARTIFACT_INVALID');
  return bytes;
}

function validEvidenceReceipt(signed, publicKey) {
  const { unsigned, signature } = unsignedReceipt(signed);
  return unsigned.schema === 'genos.gvx.remote-verification/v1' && unsigned.verified === true
    && Boolean(unsigned.artifactHash && unsigned.verifierId && unsigned.requirement && unsigned.nonce)
    && Number.isFinite(Date.parse(unsigned.checkedAt))
    && crypto.verify(null, Buffer.from(JSON.stringify(unsigned)), publicKey, Buffer.from(signature || '', 'base64'));
}

function verifiedEvidenceReceipts(receipts, publicKey) {
  if (!receipts) return [];
  if (!Array.isArray(receipts) || receipts.length > 100) throw serviceError('GVX_SUPPORTING_RECEIPTS_INVALID');
  return receipts.map((signed) => {
    if (!validEvidenceReceipt(signed, publicKey)) throw serviceError('GVX_SUPPORTING_RECEIPTS_INVALID');
    return unsignedReceipt(signed).unsigned;
  });
}

async function verifyRequest(body, config) {
  const input = parseRequest(body);
  const artifact = artifactBytes(input.artifactBase64);
  const evidence = input.evidence;
  if (!evidence || evidence.verifierId !== input.verifierId || typeof input.requirement !== 'string') {
    throw serviceError('GVX_VERIFIER_EVIDENCE_INVALID');
  }
  const trustedEvidence = { ...evidence,
    supportingReceipts: verifiedEvidenceReceipts(evidence.supportingReceipts, config.publicKey) };
  const trusted = registry.fromTrustedRegistry([input.verifierId]);
  const result = await registry.verifyEvidence({ registry: trusted,
    artifactReader: async () => artifact, evidence: trustedEvidence, requirement: input.requirement });
  const receipt = { schema: 'genos.gvx.remote-verification/v1', verified: result.verified === true,
    reason: result.reason || null, requirement: input.requirement, verifierId: input.verifierId,
    verifierVersion: result.verifierVersion || null, artifactHash: result.artifactHash || null,
    artifactRef: evidence.artifactRef, evidenceClass: result.evidenceClass || null,
    businessDecision: result.businessDecision || null,
    checkedAt: new Date().toISOString(), nonce: crypto.randomUUID() };
  const signature = crypto.sign(null, Buffer.from(JSON.stringify(receipt)), config.privateKey).toString('base64');
  return { receipt, signature };
}

function unsignedReceipt(receipt) {
  const { signature, ...unsigned } = receipt || {};
  return { unsigned, signature };
}

function validClaimIdentity(claim) { return Boolean(claim?.scope?.organizationId && claim.scope.projectId
  && claim.entityId && claim.receiptId && claim.pathwayId && typeof claim.success === 'boolean'
  && Number.isFinite(claim.predictionError) && (claim.reward === undefined || Number.isFinite(claim.reward))); }

function validClaimEvidence(claim) {
  return Array.isArray(claim?.evidenceRefs) && claim.evidenceRefs.length > 0
    && claim.evidenceRefs.every((item) => /^[a-f0-9]{64}$/.test(item.artifactHash || '')
      && typeof item.verifierId === 'string' && Boolean(item.verifierId.trim()));
}

function validDevelopmentClaim(claim) { return validClaimIdentity(claim) && validClaimEvidence(claim); }

function assessmentProof(proofs) {
  return proofs.find((item) => item.requirement === 'gvx-somatic-assessment'
    && item.verifierId === 'gvx-somatic-assessment-v1'
    && item.businessDecision?.assessmentStatus === 'recommend_somatic_trial');
}

function evidenceBoundToProofs(refs, proofs) {
  const verified = new Set(proofs.map((item) => `${item.artifactHash}\0${item.verifierId}`));
  if (!refs.length || !refs.every((item) => verified.has(`${item.artifactHash}\0${item.verifierId}`))) return false;
  const assessment = assessmentProof(proofs);
  return !assessment || refs.some((item) => item.artifactHash === assessment.artifactHash
    && item.verifierId === assessment.verifierId);
}

async function issueDevelopmentReceipt(body, config) {
  const input = parseRequest(body);
  if (input.kind !== 'development_receipt' || !validDevelopmentClaim(input.claim)) {
    throw serviceError('GVX_DEVELOPMENT_CLAIM_INVALID');
  }
  const claim = input.claim;
  const refs = claim.evidenceRefs;
  const proofs = verifiedEvidenceReceipts(input.verificationReceipts, config.publicKey);
  const bound = evidenceBoundToProofs(refs, proofs);
  if (!bound || (claim.success && !assessmentProof(proofs))) throw serviceError('GVX_DEVELOPMENT_EVIDENCE_UNBOUND');
  if (!require('./gvxReceiptClaimPolicy').claimMatches(claim, proofs, config.evaluator)) {
    throw serviceError('GVX_DEVELOPMENT_CLAIM_NOT_MEASURED');
  }
  const claimDigest = require('./developmentalBridge/developmentReceiptVerifier').receiptClaim(claim);
  const evidenceDigest = require('./epistemicAssuranceService').digest(claimDigest);
  const receipt = { schema: 'genos.gvx.development-receipt/v2', resultId: claim.receiptId,
    evidenceDigest, verifierDigest: config.keyId, status: 'verified', independent: true,
    checkedAt: new Date().toISOString(), nonce: crypto.randomUUID(), evidenceCount: refs.length };
  return require('./gvxReceiptIssuance').issue({ config, claim, proofs }, () => ({ receipt,
    signature: crypto.sign(null, Buffer.from(JSON.stringify(receipt)), config.privateKey).toString('base64') }));
}

function send(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(value));
}

async function handleRequest(request, response, config) {
  if (request.method === 'GET' && request.url === '/healthz') return send(response, 200, { status: 'ready' });
  const endpoints = ['/v1/verify', '/v1/development-receipt', '/v1/profile', '/v1/evaluate', '/v1/authorize'];
  if (request.method !== 'POST' || !endpoints.includes(request.url)) return send(response, 404, { error: 'not-found' });
  if (!authorized(request, config.token)) return send(response, 401, { error: 'unauthorized' });
  try {
    const body = await readBody(request);
    const result = await dispatchRequest(config, request.url, body);
    return send(response, 200, result);
  }
  catch (error) { return send(response, 400, { error: error.code || 'verification-failed' }); }
}

async function dispatchRequest(config, endpoint, body) {
  if (endpoint === '/v1/verify') return verifyRequest(body, config);
  if (endpoint === '/v1/development-receipt') return issueDevelopmentReceipt(body, config);
  return require('./gvxVerifierExecutionRoutes').handle(config, endpoint, parseRequest(body));
}

function startServer(options = {}) {
  loadConfiguredImplementations();
  const config = serviceConfig();
  config.evaluator = require('./gvxExecutionEvaluator').createEvaluator(config);
  require('./gvxExecutionEvaluator').registerEvaluator(config.evaluator);
  const host = options.host || process.env.GENOS_GVX_VERIFIER_HOST || '127.0.0.1';
  const port = Number(options.port ?? process.env.GENOS_GVX_VERIFIER_PORT ?? 4011);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw serviceError('GVX_VERIFIER_PORT_INVALID');
  const server = http.createServer((request, response) => { handleRequest(request, response, config); });
  server.listen(port, host);
  return server;
}

module.exports = { startServer, verifyRequest, serviceConfig, artifactBytes, MAX_REQUEST_BYTES };
