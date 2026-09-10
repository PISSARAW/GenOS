/**
 * Controller for Chaos Engineering operations.
 */

const chaosService = require('../services/chaosEngineeringService');

async function injectChaos(req, res, next) {
  try {
    const { agentId, pid, workspaceId, fleetId, mode, dryRun, reason } = req.body || {};
    // Chaos must never target an arbitrary worker by accident: an explicit
    // agent ID or PID is mandatory.
    const hasPid = Number.isInteger(pid) && pid > 0;
    if (!agentId && !hasPid) {
      return res.status(400).json({
        error: {
          code: 'CHAOS_TARGET_REQUIRED',
          message: 'An explicit chaos target is required: provide agentId or a positive integer pid.'
        }
      });
    }
    const result = await chaosService.injectChaos({
      agentId,
      pid: hasPid ? pid : undefined,
      workspaceId,
      fleetId,
      mode,
      dryRun,
      reason
    });
    const status = result.success ? 200 : 404;
    return res.status(status).json(result);
  } catch (error) {
    return next(error);
  }
}

async function listChaosTargets(req, res, next) {
  try {
    const { getDatabase } = require('../db');
    const db = await getDatabase();
    const workers = await chaosService.findEligibleWorkers(db, req.query || {});
    return res.json({
      success: true,
      count: workers.length,
      workers: workers.map((w) => ({
        id: w.id,
        name: w.name,
        role: w.role,
        status: w.status,
        parentAgentId: w.parent_agent_id,
        lineageRelation: w.lineage_relation
      }))
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  injectChaos,
  listChaosTargets
};
