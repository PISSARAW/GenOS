/**
 * Controller for Chaos Engineering operations.
 */

const chaosService = require('../services/chaosEngineeringService');

async function injectChaos(req, res, next) {
  try {
    const { agentId, workspaceId, fleetId, mode, dryRun, reason } = req.body || {};
    const result = await chaosService.injectChaos({
      agentId,
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
