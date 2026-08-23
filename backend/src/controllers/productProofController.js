const proof = require('../services/safeDebuggingProofService');
const diagnostics = require('../services/workspaceDiagnosticsService');
const telemetry = require('../services/telemetryObserver');

async function getSafeDebugging(req, res, next) {
  try { res.json(await proof.readLatest()); } catch (error) { next(error); }
}

async function runSafeDebugging(req, res, next) {
  try {
    telemetry.emitEvent({ eventType: 'PRODUCT_PROOF_STARTED', agentId: req.user?.username || 'studio', action: 'SAFE_DEBUGGING', detail: 'Started the real safe-parallel-debugging backend proof.', severity: 'info' });
    const result = await proof.executeProof();
    telemetry.emitEvent({ eventType: 'PRODUCT_PROOF_COMPLETED', agentId: req.user?.username || 'studio', action: 'SAFE_DEBUGGING', detail: 'Completed the real safe-parallel-debugging backend proof.', severity: 'info', payload: { generatedAt: result.evidence?.generated_at } });
    res.json(result);
  } catch (error) {
    telemetry.emitEvent({ eventType: 'PRODUCT_PROOF_FAILED', agentId: req.user?.username || 'studio', action: 'SAFE_DEBUGGING', detail: error.message, severity: 'error' });
    next(error);
  }
}

async function inspectWorkspace(req, res, next) {
  try { res.json(await diagnostics.inspectWorkspace(req.params.workspaceId)); } catch (error) { next(error); }
}

async function runWorkspaceTest(req, res, next) {
  try {
    const result = await diagnostics.runWorkspaceTest(req.params.workspaceId, req.body?.commandId);
    telemetry.emitEvent({ eventType: 'WORKSPACE_TEST_COMPLETED', agentId: req.user?.username || 'studio', action: 'SAFE_DEBUGGING_TEST', detail: `${result.command.label} finished for ${result.workspace.name}.`, severity: result.exitCode === 0 ? 'info' : 'warning', payload: { workspaceId: result.workspace.id, exitCode: result.exitCode, durationMs: result.durationMs } });
    res.json(result);
  } catch (error) { next(error); }
}

module.exports = { getSafeDebugging, runSafeDebugging, inspectWorkspace, runWorkspaceTest };
