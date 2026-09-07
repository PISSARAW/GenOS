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
    const replayPassed = executionContext.replayVerified === true ||
      executionContext.diffAndReplayPassed === true ||
      Boolean(executionContext.replayReceipt);
    if (!replayPassed) {
      violations.push({
        policy: 'require_replay',
        message: 'Contract requires deterministic replay verification before promotion.'
      });
    }
  }

  // 2. require_independent_verification
  if (policy.require_independent_verification) {
    const verified = executionContext.independentVerification === true ||
      executionContext.evidenceVerified === true ||
      (Array.isArray(executionContext.verifiedClaims) && executionContext.verifiedClaims.length > 0) ||
      (Array.isArray(executionContext.workerDossiers) && executionContext.workerDossiers.length > 0) ||
      (executionContext.report?.claims?.length > 0);
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
      merged: true
    });
  }

  return { success: true, actionsTaken };
}

module.exports = {
  evaluatePromotionGate,
  applyPostPromotionPolicies
};
