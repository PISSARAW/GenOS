'use strict';

const { createHash } = require('node:crypto');
const contracts = require('../contracts/symbiosisContractService');
const store = require('../holobiontStore');
const hostGate = require('../host/hostDecisionGateService');
const immuneSystem = require('../../immuneSystem');

const ADAPTER_PROVENANCE_SCHEMA = 'genos.holobiont-adapter-provenance/v1';
const boundAdapterProofs = new WeakMap();

function invalid(message, code = 'HOLOBIONT_EXECUTION_INVALID') {
  return Object.assign(new Error(message), { code });
}

function resultHash(result) {
  const serialized = JSON.stringify(result);
  if (serialized === undefined) throw invalid('A concrete capability result is required.');
  return `sha256:${createHash('sha256').update(serialized).digest('hex')}`;
}

function hashText(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function adapterId(adapter, role) {
  const declared = typeof adapter.adapterId === 'string' ? adapter.adapterId.trim() : '';
  return declared || adapter.name || role;
}

function createAdapterProof(adapter, role) {
  const implementationHash = hashText(Function.prototype.toString.call(adapter));
  const identity = { schema: ADAPTER_PROVENANCE_SCHEMA, role,
    adapterId: adapterId(adapter, role), adapterVersion: adapter.adapterVersion || null,
    implementationHash };
  return { ...identity, proofHash: hashText(JSON.stringify(identity)) };
}

function adapterProof(adapter, role, code) {
  if (typeof adapter !== 'function') throw invalid(`A functional ${role} adapter is required.`, code);
  const bound = boundAdapterProofs.get(adapter);
  if (bound && bound.role !== role) throw invalid('Adapter provenance role mismatch.', 'HOLOBIONT_ADAPTER_PROVENANCE_INVALID');
  return bound || createAdapterProof(adapter, role);
}

function bindAdapter(adapter, proof) {
  if (typeof adapter !== 'function' || !proof?.proofHash || !proof?.role) {
    throw invalid('Adapter provenance binding is invalid.', 'HOLOBIONT_ADAPTER_PROVENANCE_INVALID');
  }
  boundAdapterProofs.set(adapter, structuredClone(proof));
  return adapter;
}

function assertAdapters(input) {
  const executor = adapterProof(input.executeCapability, 'executor', 'HOLOBIONT_EXECUTOR_REQUIRED');
  const verifier = adapterProof(input.verifyCapability, 'verifier', 'HOLOBIONT_VERIFIER_REQUIRED');
  if (input.executeCapability === input.verifyCapability
    || executor.implementationHash === verifier.implementationHash) {
    throw invalid('Independent verifier must differ from the capability executor.', 'HOLOBIONT_VERIFIER_NOT_INDEPENDENT');
  }
  let trial = null;
  if (input.trialCapabilityExecutor !== undefined) {
    trial = adapterProof(input.trialCapabilityExecutor, 'trial', 'HOLOBIONT_TRIAL_EXECUTOR_REQUIRED');
  }
  return { schema: ADAPTER_PROVENANCE_SCHEMA, executor, verifier, trial };
}

function provenanceRef(proof) {
  return `${ADAPTER_PROVENANCE_SCHEMA}:${proof.role}:${proof.adapterId}:${proof.proofHash}`;
}

async function authorizeExecution(db, plan, input) {
  assertAdapters(input);
  const session = await store.getSession(db, plan.session.holobiontId);
  if (session.status !== 'ACTIVE') throw invalid('The Host must be active.', 'HOLOBIONT_SESSION_INACTIVE');
  if (session.revision !== plan.session.revision) throw invalid('Holobiont revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  await contracts.authorizeSymbiontWork(db, { holobiontId: session.holobiontId,
    symbiontId: plan.resident.id, capability: plan.capability, toolName: input.toolName });
  const contract = await contracts.getContract(db, session.holobiontId, plan.resident.id);
  if (contract.revision !== plan.contract.revision) throw invalid('Contract changed after planning.', 'HOLOBIONT_CONTRACT_REVISION_CONFLICT');
  require('../host/hostConstitutionService').authorizeHostDecision({ constitution: session.constitution,
    requestedAuthority: input.requestedAuthority, changedInvariants: input.changedInvariants });
  const classes = input.dataClasses || [];
  if (!Array.isArray(classes) || classes.some((item) => !contract.dataAccess.includes(item))) {
    throw invalid('Execution data access exceeds the contract.', 'HOLOBIONT_PRIVACY_VIOLATION');
  }
  return session;
}

function withinAllocation(amount, ceiling) {
  return Number.isFinite(amount) && amount >= 0 && ceiling !== undefined && amount <= ceiling;
}

function boundedConsumption(output, context) {
  const consumed = output.resourcesConsumed;
  if (!consumed || typeof consumed !== 'object' || Array.isArray(consumed)) {
    throw invalid('Measured resource consumption is required.', 'HOLOBIONT_USAGE_REQUIRED');
  }
  if (context.allocation.resources.tokens !== undefined && typeof consumed.tokens !== 'number') {
    throw invalid('Measured token consumption is required.', 'HOLOBIONT_USAGE_REQUIRED');
  }
  for (const [resource, raw] of Object.entries(consumed)) {
    const amount = Number(raw);
    const ceiling = context.allocation.resources[resource];
    if (!withinAllocation(amount, ceiling)) {
      throw invalid('Execution exceeded its allocation.', 'HOLOBIONT_RESOURCE_OVERRUN');
    }
    const costLimit = context.plan.contract.maxCost[resource];
    if (costLimit !== undefined && amount > costLimit) throw invalid('Execution exceeded its cost limit.', 'HOLOBIONT_RESOURCE_OVERRUN');
  }
  return consumed;
}

function independentVerifier(receipt, producerId) {
  const id = typeof receipt?.verifierId === 'string' ? receipt.verifierId.trim() : '';
  return id.length > 0 && id !== producerId;
}

function verifiedReceipt(receipt, context) {
  const refs = receipt?.evidenceRefs;
  const independent = independentVerifier(receipt, context.plan.resident.id);
  const evidence = Array.isArray(refs) && refs.length > 0
    && refs.every((ref) => typeof ref === 'string' && ref.trim());
  const bound = receipt?.resultHash === context.hash && receipt?.selfVerified !== true;
  if (receipt?.status !== 'VERIFIED' || !independent || !evidence || !bound) {
    throw invalid('Independent verification must bind evidence to the executed result.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  }
  return { ...receipt, evidenceRefs: [...new Set(refs)] };
}

async function verifyOutput(output, context) {
  if (!output || output.selfVerified === true) throw invalid('Self-verified execution is forbidden.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  const adapters = assertAdapters(context.input);
  const producer = context.executionAdapterRole === 'trial' ? adapters.trial : adapters.executor;
  if (!producer) throw invalid('Trial adapter provenance is required.', 'HOLOBIONT_TRIAL_EXECUTOR_REQUIRED');
  output = structuredClone(output);
  boundedConsumption(output, context);
  const usage = JSON.stringify(output.resourcesConsumed);
  const hash = resultHash(output.result);
  const contract = structuredClone(context.plan.contract);
  const receipt = await context.input.verifyCapability({ result: output.result, resultHash: hash,
    output, capability: context.plan.capability, symbiontId: context.plan.resident.id,
    contract, signal: context.input.signal });
  if (resultHash(output.result) !== hash) throw invalid('Result changed during verification.', 'HOLOBIONT_RESULT_CHANGED');
  if (JSON.stringify(output.resourcesConsumed) !== usage) throw invalid('Usage changed during verification.', 'HOLOBIONT_USAGE_CHANGED');
  const verification = verifiedReceipt(receipt, { ...context, hash });
  verification.evidenceRefs = [...new Set([...verification.evidenceRefs,
    provenanceRef(producer), provenanceRef(adapters.verifier)])];
  verification.adapterProvenance = { producer, verifier: adapters.verifier };
  return { ...output, verification };
}

async function confirmContract(db, plan) {
  const session = await store.getSession(db, plan.session.holobiontId);
  if (session.status !== 'ACTIVE') throw invalid('Host was closed during execution.', 'HOLOBIONT_SESSION_INACTIVE');
  const contract = await contracts.getContract(db, plan.session.holobiontId, plan.resident.id);
  if (contract?.status !== 'ACTIVE' || contract.revision !== plan.contract.revision) {
    throw invalid('Execution contract changed or was revoked.', 'HOLOBIONT_CONTRACT_REVISION_CONFLICT');
  }
}

async function authorizeOutput(db, context) {
  const { plan, output, input } = context;
  const session = await store.getSession(db, plan.session.holobiontId);
  const claim = typeof output.result === 'string' ? output.result : JSON.stringify(output.result);
  const scan = immuneSystem.scanThreats(claim);
  if (scan?.threats?.length) return { allowed: false, reason: 'IMMUNE_SIGNATURE_VETO', threats: scan.threats };
  return hostGate.authorizeHostDecision(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    decisionId: output.receiptId, resultHash: output.verification.resultHash,
    claim, evidenceRefs: output.verification.evidenceRefs, verifierId: output.verification.verifierId,
    riskScore: output.riskScore, requestedAuthority: input.requestedAuthority,
    changedInvariants: input.changedInvariants, selfVerified: false
  });
}

module.exports = { authorizeExecution, verifyOutput, authorizeOutput, confirmContract,
  assertAdapters, bindAdapter, resultHash, invalid, ADAPTER_PROVENANCE_SCHEMA };
