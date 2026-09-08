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
  return Buffer.isBuffer(left) && Buffer.isBuffer(right) && left.equals(right);
}

function rootsOverlap(left, right) {
  const relative = path.relative(left, right);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function mergeWorkspaces(winnerWorkspaceRoot, targetWorkspaceRoot, causalBaseWorkspaceRoot) {
  const winnerRoot = path.resolve(winnerWorkspaceRoot);
  const targetRoot = path.resolve(targetWorkspaceRoot);
  if (rootsOverlap(winnerRoot, targetRoot) || rootsOverlap(targetRoot, winnerRoot)) {
    throw new Error('Winner and target workspaces must be separate directories.');
  }
  const [winnerStat, targetStat] = await Promise.all([fs.promises.stat(winnerRoot), fs.promises.stat(targetRoot)]);
  if (!winnerStat.isDirectory() || !targetStat.isDirectory()) throw new Error('Winner and target workspaces must be directories.');

  const [winnerFiles, targetFiles, baseFiles] = await Promise.all([
    readWorkspaceFiles(winnerRoot),
    readWorkspaceFiles(targetRoot),
    causalBaseWorkspaceRoot ? readWorkspaceFiles(path.resolve(causalBaseWorkspaceRoot)) : Promise.resolve(null)
  ]);
  const changes = [];
  const conflicts = [];
  const filePaths = new Set([...winnerFiles.keys(), ...targetFiles.keys(), ...(baseFiles ? baseFiles.keys() : [])]);
  for (const relativePath of [...filePaths].sort()) {
    const winner = winnerFiles.get(relativePath);
    const target = targetFiles.get(relativePath);
    const base = baseFiles?.get(relativePath);
    if (!baseFiles) {
      if (!winner || sameFile(winner, target)) continue;
      if (!target) changes.push({ type: 'copy', relativePath, contents: winner });
      else conflicts.push(relativePath);
      continue;
    }
    if (sameFile(winner, target)) continue;
    if (sameFile(winner, base)) continue;
    if (sameFile(target, base)) {
      changes.push(winner ? { type: 'copy', relativePath, contents: winner } : { type: 'remove', relativePath });
    } else {
      conflicts.push(relativePath);
    }
  }
  if (conflicts.length) return { merged: false, status: 'conflict', conflicts };

  for (const change of changes) {
    const destination = path.join(targetRoot, change.relativePath);
    if (change.type === 'remove') {
      await fs.promises.rm(destination, { force: true });
    } else {
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.writeFile(destination, change.contents);
    }
  }
  return {
    merged: true,
    status: 'merged',
    copiedFiles: changes.filter((change) => change.type === 'copy').map((change) => change.relativePath),
    removedFiles: changes.filter((change) => change.type === 'remove').map((change) => change.relativePath),
    unchangedFiles: filePaths.size - changes.length
  };
}

function evaluatePromotionGate(contract = {}, executionContext = {}) {
  const policy = contract.promotion || {};
  const violations = [];
  const hasEvidence = (value) => Array.isArray(value) && value.length > 0 && value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const evidence = item.evidence || item.receipts || item.sourceRefs;
    return Array.isArray(evidence) && evidence.some((entry) => String(entry || '').trim());
  });

  // 1. require_replay
  if (policy.require_replay) {
    const receipt = executionContext.replayReceipt;
    const receiptStatus = String(receipt?.replayStatus || receipt?.replay_status || receipt?.status || '').toLowerCase();
    const validReceipt = receipt && typeof receipt === 'object' && receipt.success === true &&
      ['completed', 'reproduced', 'reconstructed', 'verified', 'success', 'succeeded'].includes(receiptStatus);
    const replayPassed = executionContext.replayVerified === true ||
      executionContext.diffAndReplayPassed === true ||
      validReceipt;
    if (!replayPassed) {
      violations.push({
        policy: 'require_replay',
        message: 'Contract requires deterministic replay verification before promotion.'
      });
    }
  }

  // 2. require_independent_verification
  if (policy.require_independent_verification) {
    const reportClaims = executionContext.report?.claims;
    const reportHasEvidence = Array.isArray(reportClaims) && reportClaims.length > 0
      && reportClaims.every((claim) => claim && Array.isArray(claim.evidence) && claim.evidence.length > 0);
    const verified = executionContext.independentVerification === true ||
      executionContext.evidenceVerified === true ||
      hasEvidence(executionContext.verifiedClaims) ||
      hasEvidence(executionContext.workerDossiers) ||
      reportHasEvidence;
    if (!verified) {
      violations.push({
        policy: 'require_independent_verification',
        message: 'Contract requires independent verification or verified evidence before promotion.'
      });
    }
  }

  // 3. require_human_approval
  const approval = executionContext.humanApprovalReceipt;
  const validHumanApproval = approval && typeof approval === 'object'
    && approval.approved === true
    && typeof approval.approvalId === 'string' && approval.approvalId.trim()
    && typeof approval.approverId === 'string' && approval.approverId.trim()
    && typeof approval.approvedAt === 'string' && approval.approvedAt.trim()
    && typeof approval.payloadHash === 'string' && /^[a-f0-9]{64}$/i.test(approval.payloadHash);
  if (policy.require_human_approval && !validHumanApproval) {
    violations.push({
      policy: 'require_human_approval',
      message: 'Contract requires a durable, hash-bound human approval receipt before promotion.'
    });
  }

  return {
    eligible: violations.length === 0,
    policy,
    violations
  };
}

async function applyPostPromotionPolicies(db, contract = {}, executionContext = {}) {
  const policy = contract.promotion || {};
  const actionsTaken = [];

  // 4. preserve_rejected_branches
  if (policy.preserve_rejected_branches && Array.isArray(executionContext.rejectedBranchIds) && executionContext.rejectedBranchIds.length) {
    for (const branchId of executionContext.rejectedBranchIds) {
      try {
        await db.run(
          "INSERT INTO telemetry_events (agent_id, event_type, action, detail, payload_json) VALUES (?, 'BRANCH_PRESERVED', 'PRESERVE', ?, ?)",
          executionContext.agentId || 'system',
          `Preserved rejected branch ${branchId} per contract promotion policy.`,
          JSON.stringify({ branchId, reason: 'contract_promotion_policy', preserved: true })
        );
        actionsTaken.push({ action: 'preserve_branch', branchId });
      } catch (error) {
        actionsTaken.push({ action: 'preserve_branch', branchId, preserved: false, error: error.message });
      }
    }
  }

  // 5. merge_workspace_automatically
  if (policy.merge_workspace_automatically && executionContext.winnerWorkspaceRoot && executionContext.targetWorkspaceRoot) {
    try {
      const merge = await mergeWorkspaces(
        executionContext.winnerWorkspaceRoot,
        executionContext.targetWorkspaceRoot,
        executionContext.causalBaseWorkspaceRoot
      );
      actionsTaken.push({
        action: 'auto_merge_workspace',
        winner: executionContext.winnerWorkspaceRoot,
        target: executionContext.targetWorkspaceRoot,
        ...merge
      });
    } catch (error) {
      actionsTaken.push({
        action: 'auto_merge_workspace',
        winner: executionContext.winnerWorkspaceRoot,
        target: executionContext.targetWorkspaceRoot,
        merged: false,
        status: 'failed',
        error: error.message
      });
    }
  }

  const mergeBlocked = actionsTaken.some((action) => action.action === 'auto_merge_workspace' && action.merged === false);
  const preservationFailed = actionsTaken.some((action) => action.action === 'preserve_branch' && action.preserved === false);
  return {
    success: !mergeBlocked && !preservationFailed,
    actionsTaken,
    ...((mergeBlocked || preservationFailed) ? {
      error: mergeBlocked
        ? 'Automatic workspace merge failed or has unresolved conflicts.'
        : 'One or more rejected branches could not be preserved.'
    } : {})
  };
}

module.exports = {
  evaluatePromotionGate,
  applyPostPromotionPolicies,
  mergeWorkspaces
};
