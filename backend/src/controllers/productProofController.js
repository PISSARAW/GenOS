const proof = require('../services/safeDebuggingProofService');
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

module.exports = { getSafeDebugging, runSafeDebugging };
