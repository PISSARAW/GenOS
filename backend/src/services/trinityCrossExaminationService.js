'use strict';

const { hashWorkspace } = require('./trinitySnapshotService');
const diagnostics = require('./workspaceDiagnosticsService');
const claimVerification = require('./trinityClaimVerificationService');
const TERMINAL_AGENT_STATES = new Set(['completed', 'error', 'failed', 'terminated', 'cancelled']);

function claimKey(claim) {
  return String(claim?.id || claim?.statement || '').trim();
}

async function loadWorldWorkspace(db, agentId) {
  return db.get(
    `SELECT a.workspace_id, a.status, w.workspace_root FROM agents a
     JOIN trinity_worlds w ON w.agent_id = a.id WHERE a.id = ?`,
    agentId
  );
}

async function examineWorld(db, world, plans) {
  const claims = Array.isArray(world.report?.claims) ? world.report.claims : [];
  try {
    const workspace = await loadWorldWorkspace(db, world.agentId);
    if (!workspace?.workspace_id || !workspace.workspace_root) throw new Error('world_workspace_unavailable');
    if (!TERMINAL_AGENT_STATES.has(workspace.status)) {
      return { worldNumber: world.worldNumber, status: 'unresolved', reason: 'world_not_terminal', receipts: [] };
    }
    if (!claims.length) return { worldNumber: world.worldNumber, status: 'no_claims', receipts: [] };
    const contentHash = await hashWorkspace(workspace.workspace_root);
    const available = await diagnostics.inspectWorkspace(workspace.workspace_id);
    const receipts = await claimVerification.verify({
      claims, plans, commands: new Set(available.testCommands.map((command) => command.id)),
      candidate: {
        candidateWorkspaceId: workspace.workspace_id,
        targetWorkspace: workspace.workspace_root,
        contentHash
      },
      sourceAgentId: world.agentId, report: world.report
    });
    return {
      worldNumber: world.worldNumber,
      status: 'verified',
      receipts,
      verifiedClaimIds: [...new Set(receipts.map((receipt) => receipt.claim))]
    };
  } catch (error) {
    return { worldNumber: world.worldNumber, status: 'unresolved', reason: error.code || error.message, receipts: [] };
  }
}

function attachVerification(world, examination) {
  const result = examination || { verifiedClaimIds: [], receipts: [] };
  const verified = new Set(result.verifiedClaimIds || []);
  const receiptsByClaim = new Map();
  for (const receipt of result.receipts || []) {
    receiptsByClaim.set(receipt.claim, [...(receiptsByClaim.get(receipt.claim) || []), receipt]);
  }
  const sourceClaims = Array.isArray(world.report?.claims) ? world.report.claims : [];
  const claims = sourceClaims.map((claim) => {
    const key = claimKey(claim);
    if (!verified.has(key)) return claim;
    return { ...claim, verificationLevel: 'independent_deterministic', verificationReceipts: receiptsByClaim.get(key) || [] };
  });
  return { ...world, report: { ...world.report, claims, crossExamination: result } };
}

async function examine(db, worlds, hypothesisDesign = {}) {
  const design = hypothesisDesign || {};
  const plans = Array.isArray(design.claimVerificationChecks) ? design.claimVerificationChecks : [];
  const examinations = await Promise.all((worlds || []).map((world) => examineWorld(db, world, plans)));
  const byWorld = new Map(examinations.map((result) => [result.worldNumber, result]));
  return {
    status: examinations.length === 3 && examinations.every((item) => item.status === 'verified' || item.status === 'no_claims') ? 'complete' : 'partial',
    worlds: examinations,
    reports: (worlds || []).map((world) => attachVerification(world, byWorld.get(world.worldNumber)))
  };
}

function summary(examination) {
  return {
    status: examination.status,
    worlds: examination.worlds.map((item) => ({
      worldNumber: item.worldNumber, status: item.status, reason: item.reason || null,
      verifiedClaimIds: item.verifiedClaimIds || [],
      receipts: (item.receipts || []).map((entry) => ({
        claim: entry.claim, commandId: entry.commandId,
        verifierWorkspaceHash: entry.verifierWorkspaceHash,
        verifierDigest: entry.verifierDigest, receipt: entry.receipt
      }))
    }))
  };
}

module.exports = { examine, summary };
