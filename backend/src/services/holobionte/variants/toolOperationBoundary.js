'use strict';

const { createHash } = require('node:crypto');
const contracts = require('../contracts/symbiosisContractService');
const variants = require('./index');

function refusal(reason, context) {
  return { allowed: false, reason, proof: { source: 'holobiont_persistent_tool_boundary',
    variantId: context.state.variantId, selectionReceiptId: context.state.selectionReceipt?.receiptId || null,
    sessionRevision: context.session.revision, contractId: context.contract?.contractId || null,
    contractRevision: context.contract?.revision || null } };
}

function policyValid(state) {
  const configured = variants.getVariant('tool').configureTool();
  return state.variantId === 'tool' && JSON.stringify(state.policy?.tool) === JSON.stringify(configured)
    && configured.requireManifest === true && configured.sandbox === 'contract-bound'
    && configured.validateSchema === true;
}

function resident(session, symbiontId) {
  return session.residentSymbionts?.some((item) => item.id === symbiontId && item.status === 'RESIDENT') === true;
}

function contractValid(context) {
  const { contract, session, symbiontId, manifest } = context;
  return contract?.status === 'ACTIVE' && contract.hostId === session.hostId
    && contract.symbiontId === symbiontId && contract.toolLeases?.includes(manifest.name) === true;
}

function permissionValid(contract, manifest) {
  const actions = new Set(contract.authorityScope?.actions || []);
  return Array.isArray(manifest.permissions) && manifest.permissions.every((item) => actions.has(item));
}

function contractProof(context) {
  const { contract, session, state } = context;
  return { source: 'holobiont_persistent_tool_boundary', variantId: state.variantId,
    selectionReceiptId: state.selectionReceipt?.receiptId || null, sessionRevision: session.revision,
    contractId: contract.contractId, contractRevision: contract.revision,
    contractHash: `sha256:${createHash('sha256').update(JSON.stringify(contract)).digest('hex')}` };
}

async function authorize(db, input) {
  const { session, state, runtimeInput } = input;
  const context = { session, state, contract: null };
  const symbiontId = String(runtimeInput.symbiontId || '').trim();
  const manifest = runtimeInput.manifest;
  const issue = inputIssue({ session, state, runtimeInput, symbiontId, manifest });
  if (issue) return refusal(issue, context);
  let contract;
  try { contract = await contracts.getContract(db, session.holobiontId, symbiontId); }
  catch (_) { return refusal('TOOL_CONTRACT_UNAVAILABLE', context); }
  context.contract = contract;
  if (!contractValid({ contract, session, symbiontId, manifest })) return refusal('TOOL_CONTRACT_NOT_ACTIVE_OR_LEASED', context);
  if (!permissionValid(contract, manifest)) return refusal('TOOL_PERMISSION_OUT_OF_SCOPE', context);
  const lease = Object.freeze({ toolName: manifest.name, contractId: contract.contractId,
    contractRevision: contract.revision, expiresAt: new Date(Date.now() + 30000).toISOString() });
  const execution = runtimeInput.execute;
  const bounded = { ...runtimeInput, leasedPermissions: [...contract.authorityScope.actions],
    toolLease: lease, verifyLease: (candidate) => candidate === lease && Date.parse(lease.expiresAt) > Date.now(),
    execute: (...args) => executeAfterRecheck({ db, session, symbiontId, contract, execution, args, lease }) };
  return { allowed: true, proof: contractProof({ contract, session, state }), runtimeInput: bounded };
}

function inputIssue(input) {
  if (!policyValid(input.state)) return 'TOOL_POLICY_NOT_BOUND';
  if (!resident(input.session, input.symbiontId)) return 'TOOL_SYMBIONT_NOT_RESIDENT';
  if (!input.manifest || typeof input.manifest.name !== 'string' || !input.manifest.name.trim()) return 'TOOL_MANIFEST_REQUIRED';
  if (typeof input.runtimeInput.execute !== 'function') return 'TOOL_EXECUTOR_REQUIRED';
  return null;
}

async function executeAfterRecheck(input) {
  const current = await contracts.getContract(input.db, input.session.holobiontId, input.symbiontId);
  if (!current || current.status !== 'ACTIVE' || current.contractId !== input.contract.contractId
    || current.revision !== input.contract.revision) {
    throw Object.assign(new Error('Tool contract changed before invocation.'), { code: 'HOLOBIONT_TOOL_CONTRACT_CHANGED' });
  }
  if (Date.parse(input.lease.expiresAt) <= Date.now()) {
    throw Object.assign(new Error('Tool lease expired before invocation.'), { code: 'HOLOBIONT_TOOL_LEASE_EXPIRED' });
  }
  if (typeof input.execution !== 'function') {
    throw Object.assign(new Error('Tool executor is required.'), { code: 'HOLOBIONT_TOOL_EXECUTOR_REQUIRED' });
  }
  return input.execution(...input.args);
}

module.exports = { authorize };
