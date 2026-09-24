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

function readStats(root) { return fs.promises.stat(root); }
function isNotDirectory(stat) { return !stat.isDirectory(); }

async function assertWorkspaceDirectories(...roots) {
  const stats = await Promise.all(roots.map(readStats));
  if (stats.some(isNotDirectory)) {
    throw new Error('Winner and target workspaces must be directories.');
  }
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

function isCopyChange(change) { return change.type === 'copy'; }
function isRemoveChange(change) { return change.type === 'remove'; }
function changeRelativePath(change) { return change.relativePath; }

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
    copiedFiles: changes.filter(isCopyChange).map(changeRelativePath),
    removedFiles: changes.filter(isRemoveChange).map(changeRelativePath),
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

function isReplayReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return false;
  if (receipt.success !== true) return false;
  const status = String(receipt.replayStatus || receipt.replay_status || receipt.status || '').toLowerCase();
  return ['completed', 'reproduced', 'verified'].includes(status);
}

function isReplayPassed(executionContext) {
  if (executionContext.replayVerified === true) return true;
  if (executionContext.diffAndReplayPassed === true) return true;
  return isReplayReceipt(executionContext.replayReceipt);
}

function buildReplayViolation(policy, executionContext) {
  if (!policy.require_replay) return null;
  if (isReplayPassed(executionContext)) return null;
  return { policy: 'require_replay', message: 'Contract requires deterministic replay verification before promotion.' };
}

function isEvidenceEntry(entry) {
  if (typeof entry === 'string') return entry.trim().length > 0;
  return Boolean(entry && typeof entry === 'object' && Object.keys(entry).length > 0);
}

function isEvidenceItem(item) {
  if (!item || typeof item !== 'object') return false;
  const evidence = item.evidence || item.receipts || item.sourceRefs;
  if (!Array.isArray(evidence)) return false;
  return evidence.some(isEvidenceEntry);
}

function hasEvidence(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(isEvidenceItem);
}

function claimHasEvidence(claim) {
  return Boolean(claim) && Array.isArray(claim.evidence) && claim.evidence.some(isEvidenceEntry);
}

function reportHasEvidence(claims) {
  if (!Array.isArray(claims) || claims.length === 0) return false;
  return claims.every(claimHasEvidence);
}

function reportClaims(executionContext) {
  const report = executionContext.report;
  if (report === null || report === undefined) return undefined;
  return report.claims;
}

function isReceiptLoaded(receipt) { return Boolean(receipt && typeof receipt === 'object'); }
function hasRequiredFields(receipt) { return Boolean(receipt.independent && receipt.resultId && receipt.evidenceDigest && receipt.verifierDigest && receipt.signature && receipt.checkedAt && receipt.nonce); }

function hasTrustedDigests(digests) { return Array.isArray(digests) && digests.length > 0; }

function isReplayedNonce(executionContext, nonce) {
  const seen = executionContext?.seenVerifierNonces;
  if (!nonce || !seen) return false;
  if (typeof seen.has === 'function') return seen.has(nonce);
  return Array.isArray(seen) && seen.includes(nonce);
}

function isIndependentVerification(executionContext, trustedVerifierDigests) {
  if (!executionContext) return false;
  const receipt = executionContext.independentVerifierReceipt;
  if (!isReceiptLoaded(receipt)) return false;
  if (!hasRequiredFields(receipt)) return false;
  if (isReplayedNonce(executionContext, receipt.nonce)) return false;
  if (!hasTrustedDigests(trustedVerifierDigests)) return false;
  if (isNaN(Date.parse(receipt.checkedAt))) return false;
  const { validateReceipt } = require('./epistemicVerifierReceiptService');
  return validateReceipt(receipt, trustedVerifierDigests);
}

function replayRefused() { return { policy: 'receipt_replay', message: 'Verifier receipt nonce was already consumed: replay refused.' }; }

function buildReplayedNonceViolation(executionContext) {
  const nonce = executionContext?.independentVerifierReceipt?.nonce;
  if (!nonce || !isReplayedNonce(executionContext, nonce)) return null;
  return replayRefused();
}

async function ensureNonceTable(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS verifier_receipt_nonces (nonce TEXT PRIMARY KEY, consumed_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
}

async function claimVerifierNonce(db, executionContext) {
  const nonce = executionContext?.independentVerifierReceipt?.nonce;
  if (typeof nonce !== 'string' || !nonce) return null;
  if (isReplayedNonce(executionContext, nonce)) return replayRefused();
  try {
    await ensureNonceTable(db);
    const claimed = await db.run('INSERT OR IGNORE INTO verifier_receipt_nonces (nonce) VALUES (?)', nonce);
    if (claimed && claimed.changes === 0) return replayRefused();
  } catch (_) { return null; }
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

function isNonBlankString(value) { return typeof value === 'string' && value.trim().length > 0; }

function isValidHumanApproval(approval) {
  if (!approval || typeof approval !== 'object') return false;
  if (approval.approved !== true) return false;
  if (!isNonBlankString(approval.approvalId)) return false;
  if (!isNonBlankString(approval.approverId)) return false;
  if (!isNonBlankString(approval.approvedAt)) return false;
  if (typeof approval.payloadHash !== 'string') return false;
  return /^[a-f0-9]{64}$/i.test(approval.payloadHash);
}

function buildApprovalViolation(policy, executionContext) {
  if (!policy.require_human_approval) return null;
  if (isValidHumanApproval(executionContext.humanApprovalReceipt)) return null;
  return { policy: 'require_human_approval', message: 'Contract requires a durable, hash-bound human approval receipt before promotion.' };
}

function evaluatePromotionGate(contract = {}, executionContext = {}) {
  const policy = contract.promotion || {};
  const violations = [];
  const replayViolation = buildReplayViolation(policy, executionContext);
  if (replayViolation) violations.push(replayViolation);
  const verificationViolation = buildVerificationViolation(policy, executionContext);
  if (verificationViolation) violations.push(verificationViolation);
  const approvalViolation = buildApprovalViolation(policy, executionContext);
  if (approvalViolation) violations.push(approvalViolation);
  violations.push(...epistemicAssurancePolicy.evaluate(policy, executionContext));
  const philosophicalGuard = require('./philosophicalPromotionGuard');
  const philosophicalViolation = philosophicalGuard.evaluatePromotion(contract, executionContext);
  if (philosophicalViolation) violations.push(philosophicalViolation);
  violations.push(...philosophyPolicy.evaluatePromotionContext(contract, executionContext));
  violations.push(...epistemicDecision.evaluatePromotionContext(contract, executionContext));
  violations.push(...ethicalComparisonPolicy.evaluatePromotionContext(contract, executionContext));
  return {
    eligible: violations.length === 0,
    policy,
    violations
  };
}

function isNonEmptyArray(value) { return Array.isArray(value) && value.length > 0; }

async function preserveRejectedBranch(db, executionContext, branchId) {
  try {
    await db.run(
      "INSERT INTO telemetry_events (agent_id, event_type, action, detail, payload_json) VALUES (?, 'BRANCH_PRESERVED', 'PRESERVE', ?, ?)",
      executionContext.agentId || 'system',
      `Preserved rejected branch ${branchId} per contract promotion policy.`,
      JSON.stringify({ branchId, reason: 'contract_promotion_policy', preserved: true })
    );
    return { action: 'preserve_branch', branchId };
  } catch (error) {
    return { action: 'preserve_branch', branchId, preserved: false, error: error.message };
  }
}

async function preserveRejectedBranches(db, policy, executionContext) {
  const actions = [];
  if (!policy.preserve_rejected_branches) return actions;
  if (!isNonEmptyArray(executionContext.rejectedBranchIds)) return actions;
  for (const branchId of executionContext.rejectedBranchIds) {
    actions.push(await preserveRejectedBranch(db, executionContext, branchId));
  }
  return actions;
}

function shouldAutoMerge(policy, executionContext) {
  return Boolean(policy.merge_workspace_automatically && executionContext.winnerWorkspaceRoot && executionContext.targetWorkspaceRoot);
}

async function runAutomaticMerge(executionContext) {
  try {
    const merge = await mergeWorkspaces(
      executionContext.winnerWorkspaceRoot,
      executionContext.targetWorkspaceRoot,
      executionContext.causalBaseWorkspaceRoot
    );
    return {
      action: 'auto_merge_workspace',
      winner: executionContext.winnerWorkspaceRoot,
      target: executionContext.targetWorkspaceRoot,
      ...merge
    };
  } catch (error) {
    return {
      action: 'auto_merge_workspace',
      winner: executionContext.winnerWorkspaceRoot,
      target: executionContext.targetWorkspaceRoot,
      merged: false,
      status: 'failed',
      error: error.message
    };
  }
}

async function applyAutomaticWorkspaceMerge(policy, executionContext) {
  if (!shouldAutoMerge(policy, executionContext)) return [];
  return [await runAutomaticMerge(executionContext)];
}

function isBlockedMerge(action) { return action.action === 'auto_merge_workspace' && action.merged === false; }
function isFailedPreservation(action) { return action.action === 'preserve_branch' && action.preserved === false; }
function selectPostPromotionError(mergeBlocked) { return mergeBlocked ? 'Automatic workspace merge failed or has unresolved conflicts.' : 'One or more rejected branches could not be preserved.'; }

function buildPostPromotionResult(actionsTaken) {
  const mergeBlocked = actionsTaken.some(isBlockedMerge);
  const preservationFailed = actionsTaken.some(isFailedPreservation);
  const result = { success: !mergeBlocked && !preservationFailed, actionsTaken };
  if (!mergeBlocked && !preservationFailed) return result;
  return { ...result, error: selectPostPromotionError(mergeBlocked) };
}
async function applyPostPromotionPolicies(db, contract = {}, executionContext = {}) {
  const policy = contract.promotion || {};
  const nonceViolation = await claimVerifierNonce(db, executionContext);
  if (nonceViolation) return { success: false, actionsTaken: [], error: `${nonceViolation.policy}: ${nonceViolation.message}` };
  const preserved = await preserveRejectedBranches(db, policy, executionContext);
  const merged = await applyAutomaticWorkspaceMerge(policy, executionContext);
  return buildPostPromotionResult([...preserved, ...merged]);
}

module.exports = {
  evaluatePromotionGate,
  applyPostPromotionPolicies,
  mergeWorkspaces,
  isReplayedNonce,
  claimVerifierNonce
};
