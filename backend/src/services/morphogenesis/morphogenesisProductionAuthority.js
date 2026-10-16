'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('../aTeam/variants/variantExecutionHelpers');

const SCHEMA = 'genos.morphogenesis-transition-authority/v1';
const TTL_MS = 30_000;

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function planSha256(plan) {
  return digest(canonicalJson(plan));
}

function identity(req, missionId) {
  const principalId = req?.user?.keyId || req?.user?.username;
  const organizationId = req?.tenant?.organizationId;
  const projectId = req?.tenant?.projectId;
  const values = { principalId, organizationId, projectId, missionId };
  if (Object.values(values).some((value) => typeof value !== 'string' || !safeId(value))) {
    throw failure('MORPHOGENESIS_AUTHORITY_IDENTITY_REQUIRED',
      'Authenticated principal, tenant and mission identities are required.');
  }
  return values;
}

function safeId(value) {
  return value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_.:-]+$/.test(value);
}

function signingKey() {
  const value = process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM;
  try {
    const key = crypto.createPrivateKey(value || '');
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('wrong key type');
    return key;
  } catch (_) {
    throw failure('MORPHOGENESIS_AUTHORITY_UNAVAILABLE',
      'A pinned Ed25519 CLI authority key is required.');
  }
}

function signer(key) {
  const bytes = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' }).subarray(-32);
  const keyId = digest(bytes).slice(0, 32);
  let trust;
  try { trust = JSON.parse(process.env.GENOS_CLI_AUTHORITY_TRUST_JSON || ''); }
  catch (_) { throw failure('MORPHOGENESIS_AUTHORITY_UNAVAILABLE', 'Rust authority trust is invalid.'); }
  if (!trust || Array.isArray(trust) || String(trust[keyId] || '').toLowerCase() !== bytes.toString('hex')) {
    throw failure('MORPHOGENESIS_AUTHORITY_UNAVAILABLE', 'Rust authority does not pin the backend signer.');
  }
  return { key, keyId };
}

function signingBytes(claims) {
  const names = ['schema', 'key_id', 'principal_id', 'organization_id', 'project_id',
    'mission_id', 'plan_sha256', 'snapshot_id', 'snapshot_sha256'];
  const values = names.map((name) => Buffer.from(claims[name], 'utf8').toString('hex'));
  values.push(String(claims.risk_millis), String(claims.degraded_mode),
    String(claims.issued_at_unix_ms), String(claims.expires_at_unix_ms),
    Buffer.from(claims.nonce, 'utf8').toString('hex'));
  return Buffer.from(`genos-morphogenesis-transition-authority-v1\n${values.join('\n')}`);
}

function proposal(plan) {
  const target = firstDefined(plan.targetTopology, plan.targetOrganization, '');
  const gain = Number(firstDefined(plan.expectedGain, plan.expectedBenefit, plan.utility));
  const cost = Number(firstDefined(plan.expectedCost?.risk, plan.expectedRisk, 0));
  if (!validProposal(target, gain, cost)) {
    throw failure('MORPHOGENESIS_AUTHORITY_EVIDENCE_REQUIRED',
      'A bounded target, expected gain and expected risk are required for Rust adjudication.');
  }
  return { resolver: 'node_transition_planner', action: 'change_topology',
    target: String(target), gain, cost };
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function validProposal(target, gain, cost) {
  return safeId(String(target)) && Number.isFinite(gain) && gain > 0
    && Number.isFinite(cost) && cost >= 0;
}

function authorityEnvelope(input) {
  const key = signer(signingKey());
  const now = Date.now();
  const claims = {
    schema: SCHEMA, key_id: key.keyId, principal_id: input.identity.principalId,
    organization_id: input.identity.organizationId, project_id: input.identity.projectId,
    mission_id: input.identity.missionId, plan_sha256: input.planHash,
    snapshot_id: input.snapshot.id, snapshot_sha256: input.snapshot.hash,
    risk_millis: input.riskMillis, degraded_mode: input.degradedMode,
    issued_at_unix_ms: now, expires_at_unix_ms: now + TTL_MS, nonce: crypto.randomUUID()
  };
  const signature = crypto.sign(null, signingBytes(claims), key.key).toString('hex');
  return { claims, signature };
}

function request(input) {
  const planHash = planSha256(input.plan);
  if (planHash !== input.snapshot.planHash) throw failure('MORPHOGENESIS_SNAPSHOT_PLAN_MISMATCH',
    'Transition snapshot is not bound to the requested plan.');
  const missionId = input.missionId || input.plan.missionId || input.agentId;
  const boundIdentity = identity(input.req, missionId);
  const riskMillis = Math.round(Math.max(0, Math.min(1,
    Number(input.plan.expectedCost?.risk ?? input.plan.expectedRisk ?? 0))) * 1000);
  const degradedMode = input.degradedMode === true;
  const envelope = authorityEnvelope({ identity: boundIdentity, planHash,
    snapshot: input.snapshot, riskMillis, degradedMode });
  return {
    schemaVersion: 1, currentTopology: input.currentTopology, missionId,
    variantId: input.variantId || null, reason: input.plan.reason || 'authenticated_transition',
    proposals: [proposal(input.plan)], transitionPlanSha256: planHash,
    transitionSnapshotId: input.snapshot.id, transitionSnapshotSha256: input.snapshot.hash,
    riskMillis, degradedMode, transitionAuthority: envelope
  };
}

function verifyResponse(response, payload, input) {
  const authority = response?.authority;
  const expectedHash = digest(payload);
  const valid = response?.schemaVersion === 1 && response.requestSha256 === expectedHash
    && response.decision === 'APPLY' && response.commitAuthorized === true
    && response.committed === false && response.governance?.allowed === true
    && authority?.planSha256 === input.snapshot.planHash
    && authority?.snapshotId === input.snapshot.id && authority?.snapshotSha256 === input.snapshot.hash;
  if (!valid) throw failure('MORPHOGENESIS_RUST_AUTHORITY_REFUSED',
    'Rust did not authorize the exact transition plan and snapshot.');
  return Object.freeze({ ...authority, requestSha256: response.requestSha256,
    decision: response.decision, governance: response.governance });
}

async function authorize(input) {
  const body = request(input);
  const payload = JSON.stringify(body);
  const runner = require('../genosCli').runGenos;
  const result = await runner(['morphogenesis-adjudicate', payload], { timeoutMs: 10000,
    envOverrides: { GENOS_CLI_AUTHORITY_TRUST_JSON: process.env.GENOS_CLI_AUTHORITY_TRUST_JSON } });
  if (!result?.ok || !result.json) throw failure('MORPHOGENESIS_RUST_AUTHORITY_UNAVAILABLE',
    result?.error || result?.stderr || 'Rust morphogenesis authority is unavailable.');
  return verifyResponse(result.json, payload, input);
}

module.exports = { authorize, planSha256, request, signingBytes, verifyResponse };
