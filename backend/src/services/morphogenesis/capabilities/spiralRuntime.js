'use strict';

const store = require('./capabilityEvidenceStore');
const spiral = require('./unblockSpiral');
const artifacts = require('./runtimeArtifacts');

async function verifiedHistory(db, input) {
  const history = await store.loadAttempts(db, input.scopeId);
  for (const item of history) {
    if (!item.outcomeRef) { item.outcomeStatus = 'UNVERIFIED'; continue; }
    const proof = await input.resolveArtifact(item.outcomeRef);
    if (!validHistoryProof(item, proof)) item.outcomeStatus = 'UNVERIFIED';
  }
  return history;
}

async function plan(db, input) {
  const attempts = await verifiedHistory(db, input);
  if (attempts.some((item) => item.outcomeStatus === 'UNVERIFIED')) {
    return { permitted: false, reason: 'UNFINISHED_OR_UNRESOLVED_ATTEMPT' };
  }
  const limit = await recenteredLimit(input, attempts);
  const candidates = [];
  for (const item of input.candidates) {
    if (!eligibleCandidate(item, limit)) continue;
    const refs = item.evidenceRefs || [];
    if (!refs.length || !(await Promise.all(refs.map(input.resolveArtifact))).every(Boolean)) continue;
    candidates.push(limit.context ? { ...item, evidenceRefs: [...refs, input.recenterEvidenceRef] } : item);
  }
  return { ...spiral.planNext({ attempts, candidates, maxScaleIndex: limit.maxScaleIndex }), limit };
}

async function requireExecution(input, adapters) {
  if (!input.attemptId || typeof input.authorize !== 'function') throw new Error('ATTEMPT_AUTHORIZATION_REQUIRED');
  for (const key of ['snapshot', 'execute', 'verify', 'restore']) {
    if (typeof adapters[key] !== 'function') throw new Error(`SPIRAL_ADAPTER_REQUIRED:${key}`);
  }
}

async function runAttempt(db, input, adapters) {
  await requireExecution(input, adapters);
  const planned = await plan(db, input);
  if (!planned.permitted) return planned;
  if (!await input.authorize(planned.candidate)) return { permitted: false, reason: 'INTERVENTION_UNAUTHORIZED' };
  const contract = { ...planned.candidate, outcomeStatus: 'UNVERIFIED' };
  const snapshot = await adapters.snapshot(contract);
  let execution;
  try {
    await store.recordAttempt(db, { ...input, contract });
    execution = await adapters.execute({ contract, snapshot });
    const verification = await adapters.verify({ contract, snapshot, execution });
    return await finish(db, { ...input, contract, verification });
  } finally {
    await adapters.restore({ snapshot, contract, execution });
  }
}

async function finish(db, input) {
  const stored = (await store.loadAttempts(db, input.scopeId)).find((item) => item.attemptId === input.attemptId);
  if (!stored || spiral.signature(stored) !== spiral.signature(input.contract)) throw new Error('ATTEMPT_CONTRACT_CONFLICT');
  const proof = await input.resolveArtifact(input.verification?.artifactRef);
  const content = proof?.content;
  if (proof?.kind !== 'intervention-verification' || content?.verifierId !== stored.verifierId || content?.signature !== spiral.signature(input.contract)
    || !['VERIFIED_FAILURE', 'VERIFIED_SUCCESS'].includes(content.status)) {
    throw new Error('INTERVENTION_VERIFICATION_REQUIRED');
  }
  const result = await store.finalizeAttempt(db, { ...input,
    contract: { outcomeStatus: content.status }, outcomeRef: input.verification.artifactRef });
  const traceRef = await artifacts.put(db, { scopeId: input.scopeId, kind: 'spiral-attempt',
    content: { ...result, contract: input.contract, outcomeRef: input.verification.artifactRef } });
  return { permitted: true, ...result, traceRef };
}

module.exports = { plan, runAttempt, finish, verifiedHistory };

function validHistoryProof(item, proof) {
  const content = proof?.content;
  return proof?.kind === 'intervention-verification' && content?.signature === spiral.signature(item)
    && content.verifierId === item.verifierId && content.status === item.outcomeStatus;
}
async function recenteredLimit(input, attempts) {
  const limit = spiral.scaleLimit({ ...input, attempts });
  if (!input.recenterEvidenceRef) return limit;
  const proof = await input.resolveArtifact(input.recenterEvidenceRef);
  const context = proof?.content;
  if (proof?.kind !== 'spiral-context-verification' || context?.status !== 'VERIFIED'
    || !input.contextVerifierId || context.verifierId !== input.contextVerifierId
    || context.previousAttemptId !== attempts.at(-1)?.attemptId) throw new Error('VERIFIED_RECENTER_CONTEXT_REQUIRED');
  if (!context.newInitialState || !context.evidenceRefs?.length
    || !(await Promise.all(context.evidenceRefs.map(input.resolveArtifact))).every(Boolean)) throw new Error('RESOLVABLE_RECENTER_EVIDENCE_REQUIRED');
  return { maxScaleIndex: Math.min(limit.maxScaleIndex, 1), reason: 'RECENTER_ON_NEW_VERIFIED_CONTEXT', context };
}

function eligibleCandidate(item, limit) {
  if (item.replicationOf && item.verifierId !== item.independentVerifierId) return false;
  if (limit.context && item.initialState !== limit.context.newInitialState) return false;
  return true;
}
