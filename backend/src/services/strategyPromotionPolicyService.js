/**
 * Strategy Promotion Policy Service
 * Enforces contract-level promotion policies:
 * - require_replay
 * - require_independent_verification
 * - require_human_approval
 * - preserve_rejected_branches
 * - merge_workspace_automatically
 */

const fs = require('node:fs');
const path = require('node:path');
const philosophyPolicy = require('./philosophyPromotionPolicyService');
const ethicalComparisonPolicy = require('./ethicalComparisonPolicyService');
const epistemicDecision = require('./epistemicDecisionService');
const epistemicAssurancePolicy = require('./epistemicAssurancePolicy');
const humanApproval = require('./promotionHumanApproval');

const WORKSPACE_MERGE_EXCLUSIONS = new Set(['.git', 'node_modules']);

async function readWorkspaceFiles(root) {
  const files = new Map();
  async function visit(directory, relativeDirectory = '') {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (WORKSPACE_MERGE_EXCLUSIONS.has(entry.name)) continue;
      const relativePath = path.join(relativeDirectory, entry.name);
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        files.set(relativePath, await fs.promises.readFile(absolutePath));
      } else if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are not supported by automatic workspace merge: ${relativePath}`);
      }
    }
  }
  await visit(root);
  return files;
}

function sameFile(left, right) { return left === right || (Buffer.isBuffer(left) && Buffer.isBuffer(right) && left.equals(right)); }

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function assertMergePreconditions(winnerRoot, targetRoot) {
  if (path.resolve(winnerRoot) !== path.resolve(targetRoot) && !isWithinRoot(winnerRoot, targetRoot) && !isWithinRoot(targetRoot, winnerRoot)) return;
  throw new Error('Winner and target workspaces must be separate directories.');
}

async function resolveRealRoot(root) {
  try { return await fs.promises.realpath(root); } catch (_) { return path.resolve(root); }
}

async function assertWorkspaceDirectories(...roots) {
  const stats = await Promise.all(roots.map((r) => fs.promises.stat(r)));
  if (stats.some((s) => !s.isDirectory())) throw new Error('Winner and target workspaces must be directories.');
}

async function readCausalBaseFiles(root) {
  if (!root) return null;
  return readWorkspaceFiles(await resolveRealRoot(root));
}

function getFileEntry(files, relativePath) { return files ? files.get(relativePath) : undefined; }

function collectFilePaths(winnerFiles, targetFiles, baseFiles) {
  const filePaths = new Set([...winnerFiles.keys(), ...targetFiles.keys()]);
  if (baseFiles) {
    for (const relativePath of baseFiles.keys()) filePaths.add(relativePath);
  }
  return filePaths;
}

function computeWorkspaceChanges(winnerFiles, targetFiles, baseFiles) {
  const changes = [];
  const conflicts = [];
  const filePaths = collectFilePaths(winnerFiles, targetFiles, baseFiles);
  for (const relativePath of [...filePaths].sort()) {
    const winner = winnerFiles.get(relativePath);
    const target = targetFiles.get(relativePath);
    const base = getFileEntry(baseFiles, relativePath);
    if (!baseFiles) {
      if (!winner || sameFile(winner, target)) continue;
      if (!target) changes.push({ type: 'copy', relativePath, contents: winner });
      else conflicts.push(relativePath);
      continue;
    }
    if (sameFile(winner, target) || sameFile(winner, base)) continue;
    if (sameFile(target, base)) {
      changes.push(winner ? { type: 'copy', relativePath, contents: winner } : { type: 'remove', relativePath });
    } else {
      conflicts.push(relativePath);
    }
  }
  return { changes, conflicts, filePaths };
}

async function safeDestination(targetRoot, realTarget, relativePath) {
  const destination = path.join(targetRoot, relativePath);
  const realParent = await resolveRealRoot(path.dirname(destination));
  if (realParent !== realTarget && !isWithinRoot(realTarget, realParent)) throw new Error(`Merge destination escapes target workspace: ${relativePath}`);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const freshParent = await resolveRealRoot(path.dirname(destination));
  if (freshParent !== realTarget && !isWithinRoot(realTarget, freshParent)) throw new Error(`Merge destination escapes target workspace: ${relativePath}`);
  const link = await fs.promises.lstat(destination).catch(() => null);
  if (link && link.isSymbolicLink()) throw new Error(`Merge destination is a symlink: ${relativePath}`);
  return destination;
}

async function applyWorkspaceChanges(targetRoot, changes) {
  const realTarget = await resolveRealRoot(targetRoot);
  for (const change of changes) {
    const destination = await safeDestination(targetRoot, realTarget, change.relativePath);
    if (change.type === 'remove') await fs.promises.rm(destination, { force: true });
    else await fs.promises.writeFile(destination, change.contents);
  }
}

function buildMergeSummary(changes, filePaths) {
  return {
    merged: true,
    status: 'merged',
    copiedFiles: changes.filter((c) => c.type === 'copy').map((c) => c.relativePath),
    removedFiles: changes.filter((c) => c.type === 'remove').map((c) => c.relativePath),
    unchangedFiles: filePaths.size - changes.length
  };
}

async function mergeWorkspaces(winnerWorkspaceRoot, targetWorkspaceRoot, causalBaseWorkspaceRoot) {
  const winnerRoot = await resolveRealRoot(winnerWorkspaceRoot);
  const targetRoot = await resolveRealRoot(targetWorkspaceRoot);
  assertMergePreconditions(winnerRoot, targetRoot);
  await assertWorkspaceDirectories(winnerRoot, targetRoot);
  const [winnerFiles, targetFiles, baseFiles] = await Promise.all([
    readWorkspaceFiles(winnerRoot),
    readWorkspaceFiles(targetRoot),
    readCausalBaseFiles(causalBaseWorkspaceRoot)
  ]);
  const { changes, conflicts, filePaths } = computeWorkspaceChanges(winnerFiles, targetFiles, baseFiles);
  if (conflicts.length) return { merged: false, status: 'conflict', conflicts };
  await applyWorkspaceChanges(targetRoot, changes);
  return buildMergeSummary(changes, filePaths);
}

function replayStatus(receipt) { return String(receipt.replayStatus || receipt.replay_status || receipt.status || '').toLowerCase(); }
function replayReceiptMatchesRun(receipt, context) { return Boolean(context?.runId && receipt.runId === context.runId && context?.agentId && receipt.agentId === context.agentId); }
function replayReceiptHasMatchingDigest(receipt) { const digest = String(receipt.stateDigest || receipt.snapshotDigest || '').toLowerCase(); return Boolean(receipt.snapshotId && /^[a-f0-9]{64}$/.test(digest) && receipt.liveDigest === digest); }
function isReplayReceipt(receipt, executionContext) {
  if (!receipt || typeof receipt !== 'object') return false;
  if (receipt.success !== true || receipt.applied !== true || receipt.replayVerified !== true) return false;
  return ['completed', 'reproduced', 'verified'].includes(replayStatus(receipt))
    && replayReceiptMatchesRun(receipt, executionContext)
    && replayReceiptHasMatchingDigest(receipt);
}

function isReplayPassed(executionContext) {
  return isReplayReceipt(executionContext.replayReceipt, executionContext);
}

function buildReplayViolation(policy, executionContext) {
  if (!policy.require_replay) return null;
  if (isReplayPassed(executionContext)) return null;
  return { policy: 'require_replay', message: 'Contract requires deterministic replay verification before promotion.' };
}

function hasHolobionteRefutations(holobionteResults) {
  if (!Array.isArray(holobionteResults)) return false;
  for (const hr of holobionteResults) {
    const results = hr?.immune?.verifierResults?.results;
    if (Array.isArray(results) && results.some((r) => r?.status === 'refuted')) return true;
  }
  return false;
}

function hasNegativeStatus(items) {
  return Array.isArray(items) && items.some((item) => item?.status === 'refuted');
}

function hasRefutationList(items) {
  return Array.isArray(items) && items.length > 0;
}

function hasContextFlagRefutation(context) {
  if (context.hasNegativeEvidence || context.negativeEvidence) return true;
  return context.immune?.rejected === true || context.independentVerifierReceipt?.status === 'refuted';
}

function hasDirectRefutations(context) {
  if (hasContextFlagRefutation(context)) return true;
  if (hasRefutationList(context.refutations) || hasRefutationList(context.unresolvedContradictions)) return true;
  return hasNegativeStatus(context.verifierResults) || hasNegativeStatus(context.independentVerifierReceipts);
}

function buildHostVetoViolation(executionContext) {
  if (!executionContext) return null;
  const aeis = executionContext.aeisEvaluation;
  if (aeis && (aeis.anyBlocked === true || aeis.allAccepted === false)) {
    return { policy: 'host_refutation_veto', message: 'Promotion is vetoed because negative evidence or refutations were detected.' };
  }
  if (aeis && hasHolobionteRefutations(aeis.holobionteResults)) {
    return { policy: 'host_refutation_veto', message: 'Promotion is vetoed because holobionte verifier refutations were detected.' };
  }
  if (hasDirectRefutations(executionContext)) {
    return { policy: 'host_refutation_veto', message: 'Promotion is vetoed because negative evidence or refutations were detected.' };
  }
  return null;
}

function isReceiptLoaded(receipt) { return Boolean(receipt && typeof receipt === 'object'); }
function hasRequiredFields(receipt) { return Boolean(receipt.independent === true && receipt.status === 'verified' && receipt.resultId && receipt.evidenceDigest && receipt.verifierDigest && receipt.signature && receipt.checkedAt && receipt.nonce); }
function hasTrustedDigests(digests) { return Array.isArray(digests) && digests.length > 0; }

function isReplayedNonce(executionContext, nonce) {
  const seen = executionContext?.seenVerifierNonces;
  if (!nonce || !seen) return false;
  if (typeof seen.has === 'function') return seen.has(nonce);
  return Array.isArray(seen) && seen.includes(nonce);
}

function isValidReceipt(receipt, trustedDigests, executionContext) {
  if (!isReceiptLoaded(receipt) || !hasRequiredFields(receipt)) return false;
  if (isReplayedNonce(executionContext, receipt.nonce)) return false;
  if (isNaN(Date.parse(receipt.checkedAt))) return false;
  const { validateReceipt } = require('./epistemicVerifierReceiptService');
  return validateReceipt(receipt, trustedDigests);
}

function collectValidReceipts(receipts, trustedDigests, executionContext) {
  if (!Array.isArray(receipts)) return [];
  const valid = [];
  const seenVerifiers = new Set();
  for (const receipt of receipts) {
    if (!isValidReceipt(receipt, trustedDigests, executionContext)) continue;
    if (seenVerifiers.has(receipt.verifierDigest)) continue;
    seenVerifiers.add(receipt.verifierDigest);
    valid.push(receipt);
  }
  return valid;
}

function isIndependentVerification(executionContext, trustedVerifierDigests) {
  if (!executionContext || !hasTrustedDigests(trustedVerifierDigests)) return false;
  const receipts = executionContext.independentVerifierReceipts
    || (executionContext.independentVerifierReceipt ? [executionContext.independentVerifierReceipt] : []);
  return collectValidReceipts(receipts, trustedVerifierDigests, executionContext).length > 0;
}

function replayRefused() { return { policy: 'receipt_replay', message: 'Verifier receipt nonce was already consumed: replay refused.' }; }
function nonceStorageRefused() { return { policy: 'receipt_nonce_storage', message: 'Verifier receipt nonce could not be durably consumed.' }; }

function buildReplayedNonceViolation(executionContext) {
  const receipts = executionContext?.independentVerifierReceipts
    || (executionContext?.independentVerifierReceipt ? [executionContext.independentVerifierReceipt] : []);
  for (const r of receipts) {
    if (r?.nonce && isReplayedNonce(executionContext, r.nonce)) return replayRefused();
  }
  return null;
}

async function ensureNonceTable(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS verifier_receipt_nonces (nonce TEXT PRIMARY KEY, consumed_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
}

async function claimSingleNonce(db, nonce, executionContext) {
  if (typeof nonce !== 'string' || !nonce) return null;
  if (isReplayedNonce(executionContext, nonce)) return replayRefused();
  try {
    await ensureNonceTable(db);
    const claimed = await db.run('INSERT OR IGNORE INTO verifier_receipt_nonces (nonce) VALUES (?)', nonce);
    if (claimed && claimed.changes === 0) return replayRefused();
    if (!claimed || claimed.changes !== 1) return nonceStorageRefused();
  } catch (_) { return nonceStorageRefused(); }
  return null;
}

async function claimVerifierNonce(db, executionContext) {
  const receipts = executionContext?.independentVerifierReceipts
    || (executionContext?.independentVerifierReceipt ? [executionContext.independentVerifierReceipt] : []);
  for (const receipt of receipts) {
    const violation = await claimSingleNonce(db, receipt?.nonce, executionContext);
    if (violation) return violation;
  }
  return null;
}

function buildVerificationViolation(policy, executionContext) {
  if (!policy.require_independent_verification) return null;
  const replayed = buildReplayedNonceViolation(executionContext);
  if (replayed) return replayed;
  const trustedDigests = policy.epistemic_verifier_digests || (executionContext && executionContext.trustedVerifierDigests) || [];
  if (isIndependentVerification(executionContext, trustedDigests)) return null;
  return { policy: 'require_independent_verification', message: 'Contract requires independent verification or verified evidence before promotion.' };
}

function extractQuorumTarget(policy) {
  const quorum = Number(policy?.minimum_verifier_quorum || policy?.verifier_quorum || 0);
  return Number.isFinite(quorum) ? quorum : 0;
}

function extractCandidateReceipts(context) {
  if (Array.isArray(context?.independentVerifierReceipts)) return context.independentVerifierReceipts;
  return context?.independentVerifierReceipt ? [context.independentVerifierReceipt] : [];
}

function resolveTrustedDigests(policy, context) {
  if (Array.isArray(policy?.epistemic_verifier_digests)) return policy.epistemic_verifier_digests;
  return Array.isArray(context?.trustedVerifierDigests) ? context.trustedVerifierDigests : [];
}

function buildQuorumViolation(policy, executionContext) {
  const quorum = extractQuorumTarget(policy);
  if (quorum <= 1) return null;
  const trustedDigests = resolveTrustedDigests(policy, executionContext);
  if (!hasTrustedDigests(trustedDigests)) {
    return { policy: 'verifier_quorum_not_met', message: `Promotion requires trusted verifier digests for quorum ${quorum}.` };
  }
  const candidateReceipts = extractCandidateReceipts(executionContext);
  const valid = collectValidReceipts(candidateReceipts, trustedDigests, executionContext);
  if (valid.length < quorum) {
    return {
      policy: 'verifier_quorum_not_met',
      message: `Promotion requires a quorum of ${quorum} distinct independent verifiers (got ${valid.length}).`
    };
  }
  return null;
}

function evaluatePromotionGate(contract = {}, executionContext = {}) {
  const policy = contract.promotion || {};
  const violations = [];
  const gateChecks = [
    buildHostVetoViolation(executionContext),
    buildQuorumViolation(policy, executionContext),
    buildReplayViolation(policy, executionContext),
    buildVerificationViolation(policy, executionContext),
    humanApproval.buildApprovalViolation(policy, executionContext),
    require('./philosophicalPromotionGuard').evaluatePromotion(contract, executionContext)
  ];
  for (const v of gateChecks) { if (v) violations.push(v); }
  violations.push(...epistemicAssurancePolicy.evaluate(policy, executionContext));
  violations.push(...philosophyPolicy.evaluatePromotionContext(contract, executionContext));
  violations.push(...epistemicDecision.evaluatePromotionContext(contract, executionContext));
  violations.push(...ethicalComparisonPolicy.evaluatePromotionContext(contract, executionContext));
  return { eligible: violations.length === 0, policy, violations };
}

function shouldAutoMerge(policy, executionContext) {
  return Boolean(policy.merge_workspace_automatically && executionContext.winnerWorkspaceRoot && executionContext.targetWorkspaceRoot);
}

async function runAutomaticMerge(executionContext) {
  const meta = { action: 'auto_merge_workspace', winner: executionContext.winnerWorkspaceRoot, target: executionContext.targetWorkspaceRoot };
  try {
    const merge = await mergeWorkspaces(meta.winner, meta.target, executionContext.causalBaseWorkspaceRoot);
    return { ...meta, ...merge };
  } catch (error) {
    return { ...meta, merged: false, status: 'failed', error: error.message };
  }
}

async function applyAutomaticWorkspaceMerge(policy, executionContext) {
  if (!shouldAutoMerge(policy, executionContext)) return [];
  return [await runAutomaticMerge(executionContext)];
}

function selectPostPromotionError(mergeBlocked) {
  return mergeBlocked ? 'Automatic workspace merge failed or has unresolved conflicts.' : 'One or more rejected branches could not be preserved.';
}

function buildPostPromotionResult(actionsTaken) {
  const mergeBlocked = actionsTaken.some((a) => a.action === 'auto_merge_workspace' && a.merged === false);
  const preservationFailed = actionsTaken.some((a) => a.action === 'preserve_branch' && a.preserved === false);
  const success = !mergeBlocked && !preservationFailed;
  return { success, actionsTaken, ...(success ? {} : { error: selectPostPromotionError(mergeBlocked) }) };
}
async function applyPostPromotionPolicies(db, contract = {}, executionContext = {}) {
  const policy = contract.promotion || {};
  const nonceViolation = await claimVerifierNonce(db, executionContext);
  if (nonceViolation) return { success: false, actionsTaken: [], error: `${nonceViolation.policy}: ${nonceViolation.message}` };
  const preserved = policy.preserve_rejected_branches
    ? await require('./rejectedBranchArchiveService').preserveRejectedBranches(db, executionContext)
    : [];
  const merged = await applyAutomaticWorkspaceMerge(policy, executionContext);
  return buildPostPromotionResult([...preserved, ...merged]);
}

module.exports = {
  readWorkspaceFiles, computeWorkspaceChanges, safeDestination, resolveRealRoot, assertMergePreconditions,
  evaluatePromotionGate, buildHostVetoViolation, buildQuorumViolation,
  isReplayPassed, applyPostPromotionPolicies, mergeWorkspaces, isReplayedNonce, claimVerifierNonce
};
