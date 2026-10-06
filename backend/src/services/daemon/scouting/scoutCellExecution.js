'use strict';

const { withTransaction } = require('../../../db');
const { migrateDaemonScout } = require('../../../db/migrations/migrateDaemonScout');
const persistence = require('./scoutColonyPersistence');
const authority = require('./scoutAuthority');

function colonyErrors(colony, ctx) {
  if (!colony || colony.state === 'DISSOLVED') return ['colony-not-found'];
  if (colony.expiresAt <= Date.now()) return ['colony-expired'];
  if (colony.territoryId !== ctx.territory.id) return ['colony-territory-mismatch'];
  return [];
}

async function reserve(ctx) {
  if (!ctx.db || !ctx.colonyId) return { errors: ['db-and-colonyId-required'] };
  await migrateDaemonScout(ctx.db);
  return withTransaction(ctx.db, async () => {
    const colony = await persistence.getColony(ctx.db, ctx.colonyId);
    const errors = colonyErrors(colony, ctx);
    if (errors.length) return { errors };
    if (await ctx.db.get('SELECT id FROM daemon_scout_cells WHERE id = ?', ctx.cellId)) return { errors: ['cell-already-reserved'] };
    const stats = await ctx.db.get('SELECT COUNT(*) AS n, COALESCE(SUM(tokens_used), 0) AS used FROM daemon_scout_cells WHERE colony_id = ?', colony.id);
    if (stats.n >= colony.maxCells) return { errors: ['colony-cell-limit'] };
    const allowance = Math.min(ctx.maxTokens ?? colony.budget, Math.floor(colony.budget * colony.llmRatio), colony.budget - stats.used);
    if (!Number.isSafeInteger(allowance) || allowance < 0) return { errors: ['colony-budget-exhausted'] };
    await ctx.db.run(`INSERT INTO daemon_scout_cells (id, colony_id, territory_id, goal, scope, state, head_sha, tokens_used, started_at)
      VALUES (?, ?, ?, ?, ?, 'RUNNING_STATIC', ?, ?, datetime('now'))`,
    ctx.cellId, colony.id, colony.territoryId, ctx.goal, JSON.stringify(ctx.scope || null), ctx.territory.headSha, allowance);
    colony.cellIds.push(ctx.cellId);
    colony.state = 'SCOUTING';
    await persistence.persistColonyUpdate(ctx.db, colony);
    return { colony, allowance };
  });
}

async function boundedAnalysis(ctx, reservation) {
  const controller = new AbortController();
  const remaining = Math.max(1, reservation.colony.expiresAt - Date.now());
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('colony-expired')); }, remaining);
  });
  try {
    return await Promise.race([ctx.analyze({ territory: ctx.territory, goal: ctx.goal,
      maxTokens: reservation.allowance, signal: controller.signal }), timeout]);
  } finally { clearTimeout(timer); }
}

async function finish(ctx, job) {
  return withTransaction(ctx.db, async () => {
    const colony = await persistence.getColony(ctx.db, ctx.colonyId);
    const errors = colonyErrors(colony, ctx);
    if (errors.length) throw new Error(errors[0]);
    const current = await ctx.db.get('SELECT head_sha FROM daemon_territories WHERE id = ?', colony.territoryId);
    if (current?.head_sha !== job.state.headSha) throw new Error('analysis-head-stale');
    await ctx.db.run(`UPDATE daemon_scout_cells SET state = 'COMPLETE', findings = ?, provenance_record_ids = ?,
      tokens_used = ?, analysis_type = ?, completed_at = datetime('now') WHERE id = ? AND state = 'RUNNING_STATIC'`,
    JSON.stringify(job.state.findings), JSON.stringify(job.state.provenanceRecordIds), job.state.tokensUsed, job.state.analysisType, ctx.cellId);
    colony.findings.push(...job.state.findings);
    await persistence.persistColonyUpdate(ctx.db, colony);
    return colony;
  });
}

async function execute(ctx, callbacks) {
  const reservation = await reserve(ctx);
  if (reservation.errors) return { ran: false, errors: reservation.errors };
  try {
    const result = await boundedAnalysis(ctx, reservation);
    const validation = callbacks.validate(result, ctx.territory);
    if (!validation.ok) throw new Error(validation.errors.join(','));
    await authority.assertProvenance(ctx.db, { result, territory: ctx.territory });
    if (result.tokensUsed > reservation.allowance) throw new Error('analysis-budget-exceeded');
    const state = callbacks.create(ctx, result);
    state.colonyId = ctx.colonyId;
    state.state = 'COMPLETE';
    state.completedAt = Date.now();
    const colony = await finish(ctx, { state });
    return { ran: true, state, colony, cellId: state.id, headSha: state.headSha,
      provenanceRecordIds: state.provenanceRecordIds, findings: state.findings,
      tokensUsed: state.tokensUsed, analysisType: state.analysisType };
  } catch (error) {
    await ctx.db.run("UPDATE daemon_scout_cells SET state = 'EXHAUSTED', completed_at = datetime('now') WHERE id = ? AND state = 'RUNNING_STATIC'", ctx.cellId);
    return { ran: false, errors: [error.message] };
  }
}

module.exports = { execute };
