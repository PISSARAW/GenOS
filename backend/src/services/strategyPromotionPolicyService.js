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

function sameFile(left, right) {
  return left === right || (Buffer.isBuffer(left) && Buffer.isBuffer(right) && left.equals(right));
}

function rootsOverlap(left, right) {
  const relative = path.relative(left, right);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertMergePreconditions(winnerRoot, targetRoot) {
  if (rootsOverlap(winnerRoot, targetRoot) || rootsOverlap(targetRoot, winnerRoot)) {
    throw new Error('Winner and target workspaces must be separate directories.');
  }
}

function readStats(root) {
  return fs.promises.stat(root);
}

function isNotDirectory(stat) {
  return !stat.isDirectory();
}

async function assertWorkspaceDirectories(...roots) {
  const stats = await Promise.all(roots.map(readStats));
  if (stats.some(isNotDirectory)) {
    throw new Error('Winner and target workspaces must be directories.');
  }
}

function readCausalBaseFiles(root) {
  if (!root) return Promise.resolve(null);
  return readWorkspaceFiles(path.resolve(root));
}

function getFileEntry(files, relativePath) {
  if (!files) return undefined;
  return files.get(relativePath);
}

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

function isCopyChange(change) {
  return change.type === 'copy';
}

function isRemoveChange(change) {
  return change.type === 'remove';
}

function changeRelativePath(change) {
  return change.relativePath;
}

async function applyWorkspaceChanges(targetRoot, changes) {
  for (const change of changes) {
    const destination = path.join(targetRoot, change.relativePath);
    if (change.type === 'remove') {
      await fs.promises.rm(destination, { force: true });
    } else {
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.writeFile(destination, change.contents);
    }
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
  const winnerRoot = path.resolve(winnerWorkspaceRoot);
  const targetRoot = path.resolve(targetWorkspaceRoot);
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
  return {
    policy: 'require_replay',
    message: 'Contract requires deterministic replay verification before promotion.'
  };
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

function isIndependentVerification(executionContext) {
  // La vérification indépendante doit être explicite et traçable.
  // Accepter simplement "claims avec evidence" ou "dossiers workers" comme
  // "vérification indépendante" est une faille critique (P0).
  if (executionContext.independentVerification === true) return true;
  // Vérification par un receipt de vérification indépendant signé.
  if (executionContext.independentVerifierReceipt) return true;
  if (executionContext.verifierReceipt && executionContext.verifierReceipt.independent === true) return true;
  return false;
}

function buildVerificationViolation(policy, executionContext) {
  if (!policy.require_independent_verification) return null;
  if (isIndependentVerification(executionContext)) return null;
  return {
    policy: 'require_independent_verification',
    message: 'Contract requires independent verification or verified evidence before promotion.'
  };
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

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
  return {
    policy: 'require_human_approval',
    message: 'Contract requires a durable, hash-bound human approval receipt before promotion.'
  };
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

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

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
  return Boolean(policy.merge_workspace_automatically) &&
    Boolean(executionContext.winnerWorkspaceRoot) &&
    Boolean(executionContext.targetWorkspaceRoot);
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

function isBlockedMerge(action) {
  return action.action === 'auto_merge_workspace' && action.merged === false;
}

function isFailedPreservation(action) {
  return action.action === 'preserve_branch' && action.preserved === false;
}

function selectPostPromotionError(mergeBlocked) {
  return mergeBlocked
    ? 'Automatic workspace merge failed or has unresolved conflicts.'
    : 'One or more rejected branches could not be preserved.';
}

function buildPostPromotionResult(actionsTaken) {
  const mergeBlocked = actionsTaken.some(isBlockedMerge);
  const preservationFailed = actionsTaken.some(isFailedPreservation);
  const result = { success: !mergeBlocked && !preservationFailed, actionsTaken };
  if (!mergeBlocked && !preservationFailed) return result;
  return { ...result, error: selectPostPromotionError(mergeBlocked) };
}

async function applyPostPromotionPolicies(db, contract = {}, executionContext = {}) {
  const policy = contract.promotion || {};
  const preserved = await preserveRejectedBranches(db, policy, executionContext);
  const merged = await applyAutomaticWorkspaceMerge(policy, executionContext);
  return buildPostPromotionResult([...preserved, ...merged]);
}

module.exports = {
  evaluatePromotionGate,
  applyPostPromotionPolicies,
  mergeWorkspaces
};
