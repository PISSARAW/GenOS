/**
 * Controller for Chaos Engineering operations.
 */

const chaosService = require('../services/chaosEngineeringService');

const CHAOS_MIN_INTERVAL_MS = Math.max(0, Number(process.env.GENOS_CHAOS_MIN_INTERVAL_MS) || 1000);
const lastInjectByActor = new Map();

function rateLimited(actor) {
  const now = Date.now();
  const last = lastInjectByActor.get(actor) || 0;
  if (now - last < CHAOS_MIN_INTERVAL_MS) return true;
  lastInjectByActor.set(actor, now);
  if (lastInjectByActor.size > 1000) lastInjectByActor.delete(lastInjectByActor.keys().next().value);
  return false;
}

function chaosActor(req) {
  return req.user?.username || req.user?.keyId || 'anonymous';
}

function chaosScope(req) {
  return { organizationId: req?.tenant?.organizationId, projectId: req?.tenant?.projectId };
}

function validateChaosTarget(req, res) {
  const { agentId, pid } = req.body || {};
  const hasPid = Number.isInteger(pid) && pid > 0;
  if (agentId || hasPid) return { agentId, pid: hasPid ? pid : undefined };
  // Chaos must never target an arbitrary worker by accident: an explicit
  // agent ID or PID is mandatory.
  res.status(400).json({
    error: {
      code: 'CHAOS_TARGET_REQUIRED',
      message: 'An explicit chaos target is required: provide agentId or a positive integer pid.'
    }
  });
  return null;
}

async function injectChaos(req, res, next) {
  try {
    const target = validateChaosTarget(req, res);
    if (!target) return undefined;
    const actor = chaosActor(req);
    if (rateLimited(actor)) {
      return res.status(429).json({
        error: { code: 'CHAOS_RATE_LIMITED', message: 'Too many chaos injections; slow down.' }
      });
    }
    const { workspaceId, fleetId, mode, dryRun, reason } = req.body || {};
    const result = await chaosService.injectChaos({
      ...target,
      workspaceId,
      fleetId,
      mode,
      dryRun,
      reason,
      actor,
      ...chaosScope(req)
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
    const filter = { ...(req.query || {}) };
    if (req.tenant) {
      filter.organizationId = req.tenant.organizationId;
      filter.projectId = req.tenant.projectId;
    }
    const workers = await chaosService.findEligibleWorkers(db, filter);
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
