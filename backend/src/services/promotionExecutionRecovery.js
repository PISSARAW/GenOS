'use strict';

const { withTransaction } = require('../db');
const journal = require('./promotionExecutionJournal');
const gate = require('./strategyPromotionGate');
const events = require('./strategyExecutionEvents');
const workspaceRecovery = require('./promotionWorkspaceRecovery');

const TRANSACTIONAL_PRIMITIVES = new Set(['stdp_update', 'synaptic_stdp_update', 'cherry_pick_golden_path', 'select_winner']);

function assertResult(result) {
  if (!result.success) throw new Error(`Promotion failed: ${result.error || 'unknown error'}`);
  if (result.controlRegulation?.arbitration?.status === 'blocked') {
    throw new Error('AEIS homeostatic rearbitration blocked promotion.');
  }
}

async function transactionalPipeline(db, id) {
  return withTransaction(db, async () => {
    const row = await journal.read(db, id);
    if (row.phase !== 'reserved') return row;
    const { promotion, evaluation, primitives } = row.payload;
    if (!primitives.every(item => TRANSACTIONAL_PRIMITIVES.has(item))) {
      throw new Error('PROMOTION_NON_TRANSACTIONAL_PRIMITIVE: explicit effect reconciliation required');
    }
    const result = await gate.runPromotionPipeline({ ...promotion, db }, primitives, evaluation);
    assertResult(result);
    return journal.advance(db, row, { phase: 'pipeline_done', result });
  });
}

async function postPromotion(db, id) {
  return withTransaction(db, async () => {
    const row = await journal.read(db, id);
    if (row.phase === 'post_pending') return row;
    if (row.phase !== 'pipeline_done') return row;
    const { promotion, options } = row.payload;
    if (promotion.contract.promotion?.merge_workspace_automatically && options.winnerWorkspaceRoot && options.targetWorkspaceRoot) {
      const mergePlan = await workspaceRecovery.plan(options);
      const claim = await db.run('INSERT OR IGNORE INTO promotion_workspace_claims (target_path, run_id) VALUES (?, ?)', mergePlan.target, id);
      if (claim.changes !== 1) throw new Error('PROMOTION_WORKSPACE_BUSY');
      return journal.advance(db, row, { phase: 'post_pending', result: { ...row.result, mergePlan } });
    }
    await gate.applyPostPromotion(db, promotion, options);
    return journal.advance(db, row, { phase: 'post_done' });
  });
}

async function externalPostPromotion(db, row) {
  if (row.phase !== 'post_pending') return;
  await withTransaction(db, async () => {
    const current = await journal.read(db, row.run_id);
    if (current.phase !== 'post_pending') return;
    const { promotion, options } = current.payload;
    await workspaceRecovery.apply(current.result.mergePlan);
    await gate.applyPostPromotion(db, promotion, { ...options, winnerWorkspaceRoot: undefined, targetWorkspaceRoot: undefined });
    await journal.advance(db, current, { phase: 'post_done' });
  });
}

async function finalize(db, id) {
  return withTransaction(db, async () => {
    const row = await journal.read(db, id);
    if (row.phase === 'completed') return completedRun(db, id);
    if (row.phase !== 'post_done') throw new Error('PROMOTION_RECONCILIATION_REQUIRED');
    const { promotion, options } = row.payload;
    await require('./epistemic/epistemicAuthorityState').assertAuthority(db, promotion.agentId);
    const run = await db.get('SELECT status, metrics_json FROM strategy_execution_runs WHERE id = ?', id);
    if (run.status !== 'awaiting_approval') throw new Error('PROMOTION_RUN_STATE_CHANGED');
    await db.run('UPDATE strategy_execution_runs SET metrics_json = ? WHERE id = ?', JSON.stringify({
      ...events.safeJson(run.metrics_json, {}),
      aeisPressure: row.result.controlRegulation?.homeostasis?.pressure ?? null,
      aeisEvidenceScore: row.result.controlRegulation?.feedback?.evidenceScore ?? null,
    }), id);
    await gate.finalizePromotion(db, promotion, options);
    await require('./biologicalWorkerReceiptService').finalize(db, id);
    await require('./selfModelService').calibrate(db, id);
    await journal.advance(db, row, { phase: 'completed' });
    await db.run('DELETE FROM promotion_workspace_claims WHERE run_id = ?', id);
    return events.getRun(db, id);
  });
}

async function completedRun(db, id) {
  const run = await events.getRun(db, id);
  if (run?.status !== 'completed') throw new Error('PROMOTION_RUN_STATE_CHANGED');
  return run;
}

async function resume(db, row, options) {
  if (journal.fingerprint(options) !== row.payload.optionsHash) throw new Error('PROMOTION_REQUEST_CHANGED');
  if (journal.fingerprint(await journal.runBinding(db, row.run_id)) !== journal.fingerprint(row.payload.binding)) {
    throw new Error('PROMOTION_BINDING_CHANGED');
  }
  gate.assertApprovalProof(row.payload.promotion, options, row.run_id);
  await gate.assertPromotionContainment(db, row.payload.promotion, options);
  await require('./epistemic/epistemicAuthorityState').assertAuthority(db, row.payload.promotion.agentId);
  if (row.phase === 'completed') return completedRun(db, row.run_id);
  await require('./aeisAssemblyStore').readAssembly(db, row.payload.promotion.aeisAssemblyId);
  await transactionalPipeline(db, row.run_id);
  const post = await postPromotion(db, row.run_id);
  await externalPostPromotion(db, post);
  return finalize(db, row.run_id);
}

module.exports = { resume };
