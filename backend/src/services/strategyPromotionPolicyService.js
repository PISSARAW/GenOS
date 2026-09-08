/**
 * Strategy Promotion Policy Service
 * Enforces contract-level promotion policies:
 * - require_replay
 * - require_independent_verification
 * - require_human_approval
 * - preserve_rejected_branches
 * - merge_workspace_automatically
 */

function evaluatePromotionGate(contract = {}, executionContext = {}) {
  const policy = contract.promotion || {};
  const violations = [];

  // 1. require_replay
  if (policy.require_replay) {
    const receipt = executionContext.replayReceipt;
    const receiptStatus = String(receipt?.replayStatus || receipt?.replay_status || receipt?.status || '').toLowerCase();
    const hasReplayHash = typeof receipt?.replayHash === 'string' && /^[a-f0-9]{64}$/i.test(receipt.replayHash);
    const hasSnapshotReplay = typeof receipt?.snapshot_id === 'string' && receipt.snapshot_id.trim()
      && Number.isInteger(receipt.replayed_steps) && receipt.replayed_steps > 0;
    const validReceipt = receipt && typeof receipt === 'object' && receipt.success === true
      && ['completed', 'reproduced', 'reconstructed', 'verified', 'success', 'succeeded'].includes(receiptStatus)
      && (hasReplayHash || hasSnapshotReplay);
    const replayPassed = validReceipt;
    if (!replayPassed) {
      violations.push({
        policy: 'require_replay',
        message: 'Contract requires deterministic replay verification before promotion.'
      });
    }
  }

  // 2. require_independent_verification
  if (policy.require_independent_verification) {
    const verification = executionContext.independentVerification;
    const validVerification = verification && typeof verification === 'object'
      && typeof verification.verifierId === 'string' && verification.verifierId.trim()
      && typeof verification.verificationHash === 'string' && /^[a-f0-9]{64}$/i.test(verification.verificationHash)
      && typeof verification.verifiedAt === 'string' && Number.isFinite(Date.parse(verification.verifiedAt))
      && verification.verifierId !== executionContext.agentId;
    const reportClaims = executionContext.report?.claims;
    const isTangibleEvidence = (item) => item && typeof item === 'object'
      && typeof item.receiptHash === 'string' && /^[a-f0-9]{64}$/i.test(item.receiptHash)
      && typeof item.source === 'string' && item.source.trim();
    const reportHasEvidence = Array.isArray(reportClaims) && reportClaims.length > 0
      && reportClaims.every((claim) => claim && Array.isArray(claim.evidence) && claim.evidence.length > 0
        && claim.evidence.every(isTangibleEvidence));
    const verified = validVerification && reportHasEvidence;
    if (!verified) {
      violations.push({
        policy: 'require_independent_verification',
        message: 'Contract requires independent verification or verified evidence before promotion.'
      });
    }
  }

  // 3. require_human_approval
  if (policy.require_human_approval && !executionContext.humanApproved) {
    violations.push({
      policy: 'require_human_approval',
      message: 'Contract requires human approval before promotion.'
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
      } catch (_) {}
    }
  }

  // 5. merge_workspace_automatically
  if (policy.merge_workspace_automatically && executionContext.winnerWorkspaceRoot && executionContext.targetWorkspaceRoot) {
    actionsTaken.push({
      action: 'auto_merge_workspace',
      winner: executionContext.winnerWorkspaceRoot,
      target: executionContext.targetWorkspaceRoot,
      merged: false,
      status: 'requires_explicit_merge',
      reason: 'Automatic workspace merge is not implemented; no merge was performed.'
    });
  }

  const mergeBlocked = actionsTaken.some((action) => action.action === 'auto_merge_workspace' && action.merged === false);
  return {
    success: !mergeBlocked,
    actionsTaken,
    ...(mergeBlocked ? { error: 'Automatic workspace merge is unavailable; explicit merge required.' } : {})
  };
}

module.exports = {
  evaluatePromotionGate,
  applyPostPromotionPolicies
};
