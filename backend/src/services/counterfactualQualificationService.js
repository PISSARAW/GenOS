'use strict';

const crypto = require('node:crypto');
const causal = require('./versionedCausalStateService');
const dossiers = require('./promotionEvidenceDossierService');
const evidenceContract = require('./promotionEvidenceContract');
const { validateReceipt } = require('./epistemicVerifierReceiptService');
const trustRegistry = require('./verifierTrustRegistry');
const { fingerprint } = require('./stateFingerprint');

const CHALLENGE_SCHEMA = 'genos.counterfactual-qualification-challenge/v1';
const RESULT_SCHEMA = 'genos.counterfactual-qualification-result/v1';

function failure(code) {
  return Object.assign(new Error(code), { code });
}

function requiredText(value, code) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw failure(code);
  return value.trim();
}

function branchInput(input, variant) {
  if (!variant || typeof variant !== 'object' || variant.state === undefined) {
    throw failure('COUNTERFACTUAL_QUALIFICATION_VARIANT_REQUIRED');
  }
  return { runId: input.runId, agentId: input.agentId,
    sourceSnapshotId: input.sourceSnapshotId, branchId: variant.branchId,
    snapshotId: variant.forkSnapshotId, purpose: variant.purpose,
    intervention: variant.intervention };
}

async function materializeVariant(db, input, variant) {
  const forked = await causal.fork(db, branchInput(input, variant));
  const appended = await causal.append(db, { runId: input.runId, agentId: input.agentId,
    branchId: forked.branchId, expectedHeadId: forked.snapshot.id,
    snapshotId: variant.snapshotId, event: variant.event, state: variant.state });
  const replay = await causal.replay(db, { runId: input.runId, agentId: input.agentId,
    fromSnapshotId: input.sourceSnapshotId, toSnapshotId: appended.snapshot.id });
  return { forked, appended, replay };
}

function challengeReceipt(input) {
  const body = { schema: CHALLENGE_SCHEMA, id: `qualification-${crypto.randomUUID()}`,
    runId: input.runId, agentId: input.agentId, dossierId: input.dossierId,
    claim: input.claim, sourceSnapshotId: input.sourceSnapshotId,
    candidateSnapshotId: input.candidate.appended.snapshot.id,
    counterfactualSnapshotId: input.counterfactual.appended.snapshot.id,
    candidateReplayReceiptId: input.candidate.replay.id,
    counterfactualReplayReceiptId: input.counterfactual.replay.id,
    diffHash: input.comparison.diffHash, evidenceDigest: `sha256:${input.comparison.diffHash}`,
    authorityHash: input.candidate.forked.authorityRef.hash, promotionEligible: false };
  return { ...body, challengeHash: fingerprint(body) };
}

async function prepare(db, input) {
  const scope = { runId: requiredText(input?.runId, 'COUNTERFACTUAL_QUALIFICATION_RUN_REQUIRED'),
    agentId: requiredText(input?.agentId, 'COUNTERFACTUAL_QUALIFICATION_AGENT_REQUIRED'),
    sourceSnapshotId: requiredText(input?.sourceSnapshotId,
      'COUNTERFACTUAL_QUALIFICATION_SOURCE_REQUIRED') };
  const claim = evidenceContract.normalizeClaims([input.claim])[0];
  const candidate = await materializeVariant(db, scope, input.candidate);
  const counterfactual = await materializeVariant(db, scope, input.counterfactual);
  const comparison = await causal.diff(db, { ...scope,
    leftSnapshotId: candidate.appended.snapshot.id,
    rightSnapshotId: counterfactual.appended.snapshot.id });
  const dossier = await dossiers.open(db, { id: input.dossierId, ...scope,
    replayReceiptId: candidate.replay.id, claims: [claim], policy: input.policy });
  return challengeReceipt({ ...scope, dossierId: dossier.id, claim, candidate,
    counterfactual, comparison });
}

function verifiedChallenge(challenge) {
  if (!challenge || challenge.schema !== CHALLENGE_SCHEMA) {
    throw failure('COUNTERFACTUAL_QUALIFICATION_CHALLENGE_INVALID');
  }
  const body = { ...challenge };
  delete body.challengeHash;
  if (fingerprint(body) !== challenge.challengeHash || challenge.promotionEligible !== false) {
    throw failure('COUNTERFACTUAL_QUALIFICATION_CHALLENGE_INVALID');
  }
  return challenge;
}

async function storedReplay(db, input) {
  const row = await db.get('SELECT * FROM causal_state_replay_receipts WHERE id = ?', input.id);
  if (!row) throw failure('COUNTERFACTUAL_QUALIFICATION_REPLAY_INVALID');
  const receipt = evidenceContract.parseCanonical(row.receipt_json,
    'COUNTERFACTUAL_QUALIFICATION_REPLAY_INVALID');
  const body = { ...receipt };
  delete body.receiptHash;
  const valid = receipt.receiptHash === row.receipt_hash && fingerprint(body) === row.receipt_hash
    && receipt.runId === input.challenge.runId && receipt.fromSnapshotId === input.challenge.sourceSnapshotId
    && receipt.toSnapshotId === input.toSnapshotId && receipt.status === 'verified'
    && receipt.promotionEligible === false && row.authority_hash === input.challenge.authorityHash;
  if (!valid) throw failure('COUNTERFACTUAL_QUALIFICATION_REPLAY_INVALID');
  return receipt;
}

function verifierActor(receipt, agentId) {
  const actorId = receipt?.independenceDescriptor?.actorId;
  if (typeof actorId !== 'string' || !actorId.trim() || actorId === agentId) {
    throw failure('COUNTERFACTUAL_QUALIFICATION_INDEPENDENCE_REQUIRED');
  }
  return actorId.trim();
}

function receiptBound(challenge, receipt) {
  return receipt.resultId === challenge.claim.id
    && receipt.evidenceDigest === challenge.evidenceDigest
    && receipt.coveredObligations?.includes(challenge.claim.id)
    && ['verified', 'refuted', 'inconclusive'].includes(receipt.status);
}

function receiptTrusted(challenge, receipt, trusted) {
  return receiptBound(challenge, receipt) && receipt.independent === true
    && validateReceipt(receipt, trusted);
}

function verifiedReceipts(challenge, receipts) {
  if (!Array.isArray(receipts) || receipts.length < 2 || receipts.length > 8) {
    throw failure('COUNTERFACTUAL_QUALIFICATION_QUORUM_REQUIRED');
  }
  const trusted = trustRegistry.listVerifierDigests();
  const actors = new Set();
  for (const receipt of receipts) {
    const actorId = verifierActor(receipt, challenge.agentId);
    if (!receiptTrusted(challenge, receipt, trusted)) {
      throw failure('COUNTERFACTUAL_QUALIFICATION_RECEIPT_INVALID');
    }
    if (actors.has(actorId)) throw failure('COUNTERFACTUAL_QUALIFICATION_CORRELATED_VERIFIERS');
    actors.add(actorId);
  }
  return receipts.map((receipt) => ({ receipt, actorId: verifierActor(receipt,
    challenge.agentId) }));
}

async function verifyCausalBinding(db, challenge) {
  await storedReplay(db, { id: challenge.candidateReplayReceiptId, challenge,
    toSnapshotId: challenge.candidateSnapshotId });
  await storedReplay(db, { id: challenge.counterfactualReplayReceiptId, challenge,
    toSnapshotId: challenge.counterfactualSnapshotId });
  const comparison = await causal.diff(db, { runId: challenge.runId,
    agentId: challenge.agentId, leftSnapshotId: challenge.candidateSnapshotId,
    rightSnapshotId: challenge.counterfactualSnapshotId });
  if (comparison.diffHash !== challenge.diffHash
      || challenge.evidenceDigest !== `sha256:${comparison.diffHash}`) {
    throw failure('COUNTERFACTUAL_QUALIFICATION_CAUSAL_BINDING_INVALID');
  }
  return comparison;
}

function evidenceKind(status) {
  if (status === 'verified') return { kind: 'supporting', status: 'verified' };
  if (status === 'refuted') return { kind: 'refuting', status: 'verified' };
  return { kind: 'context', status: 'inconclusive' };
}

async function addVerifierEvidence(db, input) {
  for (const item of input.receipts) {
    const classification = evidenceKind(item.receipt.status);
    await dossiers.addEvidence(db, { dossierId: input.challenge.dossierId,
      runId: input.challenge.runId, agentId: input.challenge.agentId,
      claimId: input.challenge.claim.id, ...classification,
      sourceRef: `epistemic-receipt://${item.receipt.nonce}`,
      sourceHash: input.challenge.diffHash, producerId: input.challenge.agentId,
      verifierId: item.actorId, payload: { receipt: item.receipt,
        counterfactualReplayReceiptId: input.challenge.counterfactualReplayReceiptId } });
  }
}

function falsificationOutcome(receipts) {
  if (receipts.some((item) => item.receipt.status === 'refuted')) return 'refuted';
  if (receipts.every((item) => item.receipt.status === 'verified')) return 'survived';
  return 'inconclusive';
}

async function complete(db, input) {
  const challenge = verifiedChallenge(input?.challenge);
  await verifyCausalBinding(db, challenge);
  const receipts = verifiedReceipts(challenge, input.verifierReceipts);
  await addVerifierEvidence(db, { challenge, receipts });
  const outcome = falsificationOutcome(receipts);
  await dossiers.addFalsification(db, { dossierId: challenge.dossierId,
    runId: challenge.runId, agentId: challenge.agentId, claimId: challenge.claim.id,
    method: 'Independent signed verification of the candidate under the causal perturbation.',
    verifierId: `counterfactual-quorum-${fingerprint(receipts.map((item) => item.actorId)).slice(0, 16)}`,
    outcome, counterexample: { found: outcome === 'refuted', diffHash: challenge.diffHash,
      replayReceiptId: challenge.counterfactualReplayReceiptId } });
  const decision = await dossiers.seal(db, { dossierId: challenge.dossierId,
    runId: challenge.runId, agentId: challenge.agentId });
  if (decision.claimsHash !== fingerprint([challenge.claim])) {
    throw failure('COUNTERFACTUAL_QUALIFICATION_CLAIM_BINDING_INVALID');
  }
  const body = { schema: RESULT_SCHEMA, challengeHash: challenge.challengeHash,
    dossierId: challenge.dossierId, decisionReceiptHash: decision.receiptHash,
    disposition: decision.disposition, promotionEligible: decision.promotionEligible,
    authorizesPromotion: false };
  return { ...body, resultHash: fingerprint(body), decision };
}

module.exports = { CHALLENGE_SCHEMA, RESULT_SCHEMA, prepare, complete };
