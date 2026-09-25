'use strict';

const crypto = require('crypto');
const { hashWorkspace } = require('./trinitySnapshotService');
const claimVerification = require('./trinityClaimVerificationService');
const diagnostics = require('./workspaceDiagnosticsService');

function outputHash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function commandReceipt(result, commandId) {
  return {
    commandId, command: result.command, exitCode: result.exitCode, signal: result.signal || null,
    durationMs: result.durationMs, stdoutHash: outputHash(result.stdout), stderrHash: outputHash(result.stderr),
    passed: result.exitCode === 0 && !result.signal
  };
}

async function runIntegrationChecks(candidate, required) {
  const available = await diagnostics.inspectWorkspace(candidate.candidateWorkspaceId);
  const commands = new Set(available.testCommands.map((command) => command.id));
  if (required.some((id) => !commands.has(id))) throw Object.assign(new Error('A configured integration check is unavailable in the candidate.'), { code: 'TRINITY_INTEGRATION_CHECK_UNAVAILABLE' });
  const receipts = [];
  for (const commandId of required) {
    const receipt = await diagnostics.runWorkspaceTest(candidate.candidateWorkspaceId, commandId);
    receipts.push(commandReceipt(receipt, commandId));
    if (receipt.exitCode !== 0 || receipt.signal) throw Object.assign(new Error(`Integration check failed: ${commandId}`), { code: 'TRINITY_INTEGRATION_CHECK_FAILED' });
  }
  return { commands, receipts };
}

async function verify(db, input) {
  const { missionId, winner, artifact } = input;
  const row = await db.get('SELECT design_json FROM trinity_experiments WHERE mission_id = ?', missionId);
  const design = JSON.parse(row?.design_json || '{}');
  const required = Array.isArray(design.integrationChecks) ? design.integrationChecks : [];
  if (!required.length) throw Object.assign(new Error('No integration checks were configured.'), { code: 'TRINITY_INTEGRATION_CHECKS_REQUIRED' });
  const checked = await runIntegrationChecks(artifact, required);
  const claims = Array.isArray(winner.report?.claims) ? winner.report.claims : [];
  const claimChecks = await claimVerification.verify({
    claims, plans: design.claimVerificationChecks, commands: checked.commands, candidate: artifact,
    sourceAgentId: winner.agentId, report: winner.report
  });
  const contentHash = await hashWorkspace(artifact.targetWorkspace);
  if (contentHash !== artifact.contentHash) throw Object.assign(new Error('Candidate changed during verification.'), { code: 'TRINITY_CANDIDATE_HASH_CHANGED' });
  return { contentHash, integrationChecks: checked.receipts, claimChecks, claimsCoveredByChecks: true, sourceAgentId: winner.agentId };
}

module.exports = { verify };
