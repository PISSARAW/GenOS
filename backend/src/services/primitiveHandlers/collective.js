/**
 * Lot 5 : Primitives Collectives & Swarm Intelligence
 * (pheromone_deposit, trail_selection, brier_scores, quorum, weighted_quorum)
 */
const telemetry = require('../telemetryObserver');
const dynOrg = require('../dynamicOrganizationService');
const { getDatabase } = require('../../db');
const {
  normalizePheromoneInput,
  validatePheromoneInput,
  resolveFinalStrength,
  pheromoneContent,
  pheromoneAction,
  pheromoneDetail,
  trailHalfLife,
  referenceTimestamp,
  trailLimit,
  explicitVersion,
  trailQuery,
  accumulateTrailStrengths,
  rankTrails,
  resolveTrailMode,
  buildTrailProbabilities,
  selectTrail,
  isTruncated,
  evaporationOrchestratorId,
  pruneThreshold,
  dryRunFlag,
  collectEvaporated,
  purgeExpiredTraces
} = require('./collectiveHelpers');

async function pheromoneDeposit(context) {
  // Stigmergie : Un agent dépose une "phéromone" (trace) sur un chemin/artefact.
  const db = await getDatabase();
  const orchestratorId = resolveOrchestratorId(context);
  const input = normalizePheromoneInput(context, orchestratorId);
  const validationError = validatePheromoneInput(orchestratorId, input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const finalStrength = resolveFinalStrength(input);

  // On utilise l'infrastructure DynamicOrganization pour diffuser la trace
  try {
    const msg = await dynOrg.publish(db, {
      orchestratorId,
      senderAgentId: input.agentId,
      kind: 'trace',
      content: pheromoneContent(input.path, finalStrength),
      payload: { type: 'pheromone', path: input.path, strength: finalStrength, isRepellent: finalStrength < 0 }
    });
    telemetry.emitEvent({
      eventType: 'SWARM_PHEROMONE_DEPOSIT',
      agentId: input.agentId,
      action: pheromoneAction(finalStrength),
      detail: pheromoneDetail(input.path, finalStrength),
      severity: 'info',
      payload: { path: input.path, strength: finalStrength, isRepellent: finalStrength < 0, msgId: msg.id }
    });
    return { success: true, path: input.path, strength: finalStrength, isRepellent: finalStrength < 0, messageId: msg.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function trailSelection(context) {
  // Sélection stigmergique : Lit les phéromones et choisit le chemin le plus fort.
  const db = await getDatabase();
  const orchestratorId = resolveOrchestratorId(context);
  if (!orchestratorId) {
    return { success: false, error: 'orchestratorId required for trail_selection.' };
  }
  try {
    const state = await dynOrg.getState(db, orchestratorId);
    if (!state) return { success: false, error: `Orchestrator '${orchestratorId}' has no active organization.` };
    const halfLife = trailHalfLife(context);
    if (halfLife === null) {
      return { success: false, error: 'evaporationHalfLifeMs must be positive.' };
    }
    const referenceTime = referenceTimestamp(context);
    const limit = trailLimit(context);
    if (limit === null) {
      return { success: false, error: 'traceLimit must be an integer between 1 and 10000.' };
    }
    const version = explicitVersion(context);
    const { versionFilter, queryParams, countParams } = trailQuery(version, limit, orchestratorId);

    const rows = await db.all(
      `SELECT payload_json, created_at FROM agent_organization_messages 
        WHERE orchestrator_id = ? ${versionFilter} AND kind = 'trace' ORDER BY id DESC LIMIT ?`,
      ...queryParams
    );
    const totalTraceCount = await db.get(
      `SELECT COUNT(*) AS count FROM agent_organization_messages
       WHERE orchestrator_id = ? ${versionFilter} AND kind = 'trace'`,
      ...countParams
    );

    const trailStrengths = accumulateTrailStrengths(rows, { referenceTime, halfLife });
    const { repellentTrails, candidateTrails } = rankTrails(trailStrengths, context);
    const mode = resolveTrailMode(context);
    const trailProbabilities = buildTrailProbabilities(candidateTrails, trailStrengths, { mode, context });
    const selectedTrail = candidateTrails.length > 0 ? selectTrail(candidateTrails, trailProbabilities, mode) : null;
    const truncated = isTruncated(totalTraceCount, rows.length);

    telemetry.emitEvent({
      eventType: 'SWARM_TRAIL_SELECTION',
      agentId: context.agentId || orchestratorId,
      action: 'TRAIL_SELECTION',
      detail: `Selected trail ${selectedTrail || 'none'} from ${candidateTrails.length} candidates (mode: ${mode}).`,
      severity: 'info',
      payload: { selectedTrail, trailStrengths, trailProbabilities, repellentTrails, mode, referenceTime: new Date(referenceTime).toISOString(), traceLimit: limit, truncated }
    });
    return {
      success: true,
      selectedTrail,
      trailStrengths,
      trailProbabilities,
      repellentTrails,
      mode,
      traceLimit: limit,
      truncated
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function evaporation(context) {
  // Évaporation active & purge stigmergique des traces obsolètes (< pruneThreshold)
  const db = await getDatabase();
  const orchestratorId = evaporationOrchestratorId(context);
  if (!orchestratorId) {
    return { success: false, error: 'orchestratorId required for evaporation.' };
  }

  try {
    const halfLife = trailHalfLife(context);
    if (halfLife === null) {
      return { success: false, error: 'evaporationHalfLifeMs must be positive.' };
    }
    const threshold = pruneThreshold(context);
    const referenceTime = referenceTimestamp(context);
    const dryRun = dryRunFlag(context);

    const rows = await db.all(
      `SELECT id, payload_json, created_at FROM agent_organization_messages 
       WHERE orchestrator_id = ? AND kind = 'trace' ORDER BY id ASC`,
      orchestratorId
    );

    const { expiredIds, remainingStrengths } = collectEvaporated(rows, { referenceTime, halfLife, pruneThreshold: threshold });

    if (!dryRun && expiredIds.length > 0) {
      await purgeExpiredTraces(db, expiredIds);
    }

    const activeTrailsCount = Object.keys(remainingStrengths).length;

    telemetry.emitEvent({
      eventType: 'SWARM_EVAPORATION_CYCLE',
      agentId: context.agentId || orchestratorId,
      action: 'EVAPORATION_CYCLE',
      detail: `Evaporated traces for ${orchestratorId}: purged ${expiredIds.length} expired, retained ${Object.keys(remainingStrengths).length} active paths.`,
      severity: 'info',
      payload: {
        orchestratorId,
        purgedTracesCount: expiredIds.length,
        activeTrailsCount,
        pruneThreshold: threshold,
        evaporationHalfLifeMs: halfLife,
        dryRun
      }
    });

    return {
      success: true,
      orchestratorId,
      purgedTracesCount: expiredIds.length,
      activeTrailsCount,
      remainingStrengths,
      dryRun
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function resolveOrchestratorId(context = {}) {
  return context.orchestratorId || context.orchestrator_id || context.orchestrator || null;
}

const { brierScores, quorum, weightedQuorum } = require('./collectiveConsensus');

module.exports = {
  pheromoneDeposit,
  trailSelection,
  evaporation,
  brierScores,
  quorum,
  weightedQuorum,
  resolveOrchestratorId
};
