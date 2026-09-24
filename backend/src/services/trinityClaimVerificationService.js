'use strict';

const crypto = require('crypto');
const path = require('path');
const workspaceLifecycle = require('./agentWorkspaceLifecycleService');
const { hashWorkspace } = require('./trinitySnapshotService');
const diagnostics = require('./workspaceDiagnosticsService');
const verifierBridge = require('./epistemic/verifierRuntimeBridge');
const verifierTrust = require('./verifierTrustRegistry');
const verifierReceipts = require('./epistemicVerifierReceiptService');

function claimKey(claim) {
  return String(claim?.id || claim?.statement || claim || '').trim();
}

function planForClaim(claim, plans, commands) {
  const key = claimKey(claim);
  const matches = (Array.isArray(plans) ? plans : []).filter((plan) => plan.claim === key);
  const commandIds = matches.length === 1 && Array.isArray(matches[0].commandIds) ? matches[0].commandIds : [];
  if (!commandIds.length || commandIds.some((id) => !commands.has(id))) {
    throw Object.assign(new Error(`Claim lacks one unambiguous plan with available verification commands: ${key}`), { code: 'TRINITY_CLAIM_VERIFICATION_REQUIRED' });
  }
  return { key, commandIds };
}

function evidenceDigest(input) {
  const { claim, contentHash, commandId } = input;
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify([claim, contentHash, commandId])).digest('hex')}`;
}

function buildAntigen(input) {
  const { id, claim, digest, sourceAgentId, sourceWorkspaceId, report } = input;
  return {
    id,
    claim: { text: typeof claim === 'string' ? claim : claim.statement || claim.claim || id },
    epitopes: { evidence: { kind: 'test_result', digest }, assumptions: [] },
    producer: { actorId: sourceAgentId, model: report?.model || report?.modelTier || 'trinity-worker', version: '1.0', strategy: 'solve', workspaceId: sourceWorkspaceId }
  };
}

function buildVerifier(input) {
  const { id, command, cwd, workspaceId } = input;
  return {
    id,
    type: 'testResult',
    actorId: `trinity-verifier:${id}`,
    model: 'genos-isolated-test-runner',
    version: '1.0',
    strategy: ['independent-replay', `command:${command.id}`],
    workspaceId,
    test: { command: [command.executable, ...command.args].join(' '), cwd: path.join(cwd, command.cwd || ''), timeoutMs: 120000 }
  };
}

function receiptMatchesRequest(input) {
  const { result, expectedId, digest, trustedDigests } = input;
  const receipt = result?.receipt;
  return result?.status === 'verified' && receipt?.status === 'verified'
    && receipt.independent === true && receipt.resultId === expectedId
    && receipt.evidenceDigest === digest && receipt.coveredObligations?.includes(expectedId)
    && verifierReceipts.validateReceipt(receipt, trustedDigests);
}

function receiptMatchesIndependentIdentity(input) {
  const { result, sourceAgentId, sourceWorkspaceId, verifierWorkspaceId } = input;
  const descriptor = result?.receipt?.independenceDescriptor || {};
  return descriptor.actorId !== sourceAgentId && descriptor.workspaceId !== sourceWorkspaceId
    && descriptor.workspaceId === verifierWorkspaceId;
}

function assertIndependentReceipt(input) {
  const { result, expectedId } = input;
  const valid = receiptMatchesRequest(input) && receiptMatchesIndependentIdentity(input);
  if (!valid) throw Object.assign(new Error(`No trusted independent verifier receipt for ${expectedId}.`), { code: 'TRINITY_INDEPENDENT_VERIFIER_FAILED' });
  return result.receipt;
}

async function verifyOne(input) {
  const { claim, commandId, candidate, sourceAgentId, report } = input;
  const commandInfo = await diagnostics.resolveWorkspaceTestCommand(candidate.candidateWorkspaceId, commandId);
  const verifierWorkspaceId = `trinity_verify_${crypto.randomBytes(10).toString('hex')}`;
  let verifierRoot;
  try {
    verifierRoot = await workspaceLifecycle.createIsolatedWorkspace(candidate.targetWorkspace, verifierWorkspaceId);
    const cloneHash = await hashWorkspace(verifierRoot);
    if (cloneHash !== candidate.contentHash) throw Object.assign(new Error('Verifier workspace does not match the promoted candidate.'), { code: 'TRINITY_VERIFIER_SNAPSHOT_MISMATCH' });
    const digest = evidenceDigest({ claim: claimKey(claim), contentHash: candidate.contentHash, commandId });
    const resultId = `trinity-claim-${crypto.randomBytes(10).toString('hex')}`;
    const antigen = buildAntigen({ id: resultId, claim, digest, sourceAgentId, sourceWorkspaceId: candidate.candidateWorkspaceId, report });
    const verifier = buildVerifier({ id: `${resultId}:${commandId}`, command: commandInfo.command, cwd: verifierRoot, workspaceId: verifierWorkspaceId });
    const output = await verifierBridge.executeVerifierWorkers(antigen, [verifier], { timeoutMs: 120000 });
    const trustedDigests = verifierTrust.resolveTrustedVerifierDigests({});
    const receipt = assertIndependentReceipt({
      result: output.results[0], expectedId: resultId, digest, trustedDigests,
      sourceAgentId, sourceWorkspaceId: candidate.candidateWorkspaceId, verifierWorkspaceId
    });
    return {
      claim: claimKey(claim), commandId, verifierWorkspaceHash: cloneHash,
      verifierDigest: receipt.verifierDigest, receipt,
      observations: output.results[0].observations || [], counterexamples: output.results[0].counterexamples || []
    };
  } finally {
    if (verifierRoot) await workspaceLifecycle.cleanupWorkspace(verifierRoot).catch(() => {});
  }
}

async function verify(input) {
  const { claims, plans, commands } = input;
  if (!claims.length) return [];
  const receipts = [];
  for (const claim of claims) {
    const plan = planForClaim(claim, plans, commands);
    for (const commandId of plan.commandIds) {
      receipts.push(await verifyOne({ ...input, claim, commandId }));
    }
  }
  return receipts;
}

module.exports = { verify };
