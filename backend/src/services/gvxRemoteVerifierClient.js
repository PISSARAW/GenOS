'use strict';

const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const MAX_RESPONSE_BYTES = 1024 * 1024;

function requestOptions(url, token) {
  const target = new URL(url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && local)) {
    throw remoteError('GVX_REMOTE_VERIFIER_TLS_REQUIRED');
  }
  return { target, transport: target.protocol === 'https:' ? https : http,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } };
}

function verifySignature(receipt, signature, publicKey) {
  const content = Buffer.from(JSON.stringify(receipt));
  return crypto.verify(null, content, publicKey, Buffer.from(signature, 'base64'));
}

function parseResponse(response, statusCode) {
  let parsed;
  try { parsed = JSON.parse(response); } catch (_) { throw remoteError('GVX_REMOTE_VERIFIER_RESPONSE_INVALID'); }
  if (statusCode < 200 || statusCode >= 300) {
    throw Object.assign(remoteError('GVX_REMOTE_VERIFIER_REJECTED'), { reason: parsed.error, statusCode });
  }
  return parsed;
}

function post(input) {
  const { url, token, payload, endpoint = '/v1/verify' } = input;
  const options = requestOptions(url, token);
  if (!['http:', 'https:'].includes(options.target.protocol)) throw remoteError('GVX_REMOTE_VERIFIER_PROTOCOL_INVALID');
  options.target.pathname = endpoint;
  options.target.search = '';
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = options.transport.request(options.target, { method: 'POST', headers: {
      ...options.headers, 'content-length': Buffer.byteLength(body)
    }, timeout: input.timeoutMs || 15000 }, (response) => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        data += chunk;
        if (Buffer.byteLength(data) > MAX_RESPONSE_BYTES) request.destroy(remoteError('GVX_REMOTE_VERIFIER_RESPONSE_TOO_LARGE'));
      });
      response.on('end', () => {
        try { resolve(parseResponse(data, response.statusCode || 500)); } catch (error) { reject(error); }
      });
    });
    request.on('timeout', () => request.destroy(remoteError('GVX_REMOTE_VERIFIER_TIMEOUT')));
    request.on('error', reject);
    request.end(body);
  });
}

async function verify(options) {
  const response = await post({ url: options.url, token: options.token, payload: {
    verifierId: options.evidence.verifierId, requirement: options.requirement,
    evidence: options.evidence, artifactBase64: options.artifact.toString('base64')
  } });
  if (!response.receipt || !response.signature
      || !verifySignature(response.receipt, response.signature, options.publicKey)) {
    throw remoteError('GVX_REMOTE_VERIFIER_SIGNATURE_INVALID');
  }
  return { ...response.receipt, signature: response.signature };
}

async function issueDevelopmentReceipt(options) {
  const claim = options.claim;
  const response = await post({ url: options.url, token: options.token, endpoint: '/v1/development-receipt', payload: {
    kind: 'development_receipt', claim: { scope: claim.scope, entityId: claim.entityId, agentId: claim.agentId,
      receiptId: claim.receiptId, pathwayId: claim.pathwayId, contextHash: claim.contextHash,
      success: claim.success, predictionError: claim.predictionError, reward: claim.reward,
    evidenceRefs: (claim.evidenceRefs || []).map((item) => ({ artifactHash: item.artifactHash, verifierId: item.verifierId })) },
    verificationReceipts: options.verificationReceipts
  } });
  if (!response.receipt || !response.signature
      || !verifySignature(response.receipt, response.signature, options.publicKey)) {
    throw remoteError('GVX_REMOTE_VERIFIER_SIGNATURE_INVALID');
  }
  return { ...response.receipt, signature: response.signature };
}

function remoteError(code) { return Object.assign(new Error(code), { code }); }

async function signedRequest(options) {
  const response = await post(options);
  if (!response.receipt || !response.signature
      || !verifySignature(response.receipt, response.signature, options.publicKey)) {
    throw remoteError('GVX_REMOTE_VERIFIER_SIGNATURE_INVALID');
  }
  return response.receipt;
}

module.exports = { verify, issueDevelopmentReceipt, verifySignature, requestOptions, signedRequest };
