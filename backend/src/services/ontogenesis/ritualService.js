'use strict';

const crypto = require('crypto');
const { reviewAction } = require('./reviewPolicy');
const { listFailures } = require('./memoryService');
const { notify, requestApproval } = require('./notificationService');
const { setTaskStatus } = require('./projectStore');

/**
 * Rituel adversarial avant action coûteuse (ADR 0237 §1).
 * Trois chambres indépendantes et déterministes évaluent l'action :
 * exécuter, différer, déléguer. L'unanimité autorise, sinon le
 * dissentiment est persisté et transmis à l'opérateur avec le
 * dossier complet — jamais résumé en consensus mou. Une approbation
 * accordée vaut pour le rituel courant, pas pour les suivants.
 */

const CHAMBERS = ['executer', 'differer', 'deleguer'];

function riskOf(failures) {
  return (failures || []).length;
}

function chamberExecuter(action, context) {
  if (!context.budgetsOk) return { chamber: 'executer', verdict: 'defer', reason: 'budgets-epuises' };
  if (riskOf(context.failures) >= 2) return { chamber: 'executer', verdict: 'defer', reason: 'echecs-repetes' };
  if (context.reversibility === 'irreversible') return { chamber: 'executer', verdict: 'defer', reason: 'irreversible-sans-approbation' };
  return { chamber: 'executer', verdict: 'proceed', reason: 'perimetre-autorise' };
}

function chamberDifferer(action, context) {
  if (context.reversibility === 'reversible' && riskOf(context.failures) < 2 && context.budgetsOk) {
    return { chamber: 'differer', verdict: 'proceed', reason: 'concorde' };
  }
  return { chamber: 'differer', verdict: 'defer', reason: 'prudence' };
}

function chamberDeleguer(action, context) {
  if (context.reversibility === 'reversible' && riskOf(context.failures) < 2) {
    return { chamber: 'deleguer', verdict: 'proceed', reason: 'concorde' };
  }
  return { chamber: 'deleguer', verdict: 'handoff', reason: 'jugement-requis' };
}

function evaluateChambers(action, context) {
  return [chamberExecuter(action, context), chamberDifferer(action, context), chamberDeleguer(action, context)];
}

function isUnanimous(chambers) {
  return chambers.every((chamber) => chamber.verdict === 'proceed');
}

function parseEvidence(row) {
  try {
    return JSON.parse(row.evidence_json || '{}');
  } catch (_) {
    return {};
  }
}

async function findRituals(db, input) {
  const rows = await db.all('SELECT * FROM ontogenesis_decisions WHERE project_id = ? ORDER BY created_at ASC', [input.projectId]);
  return rows
    .map((row) => ({ row, evidence: parseEvidence(row) }))
    .filter((item) => item.evidence.ritualId && item.row.task_id === (input.taskId || null));
}

function latestRitual(rituals) {
  return rituals.length > 0 ? rituals[rituals.length - 1] : null;
}

async function openRitual(db, input) {
  const chambers = evaluateChambers(input.action, input.context);
  const ritualId = `rit_${crypto.randomUUID()}`;
  const decisionId = `dec_${crypto.randomUUID()}`;
  const rationale = chambers.map((chamber) => `${chamber.chamber}:${chamber.verdict}:${chamber.reason}`).join(' | ');
  await db.run(
    `INSERT INTO ontogenesis_decisions (id, project_id, task_id, alternatives_json, rationale, evidence_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [decisionId, input.projectId, input.taskId || null,
      JSON.stringify(chambers), rationale,
      JSON.stringify({ ritualId, status: 'open', review: input.review, action: input.action })]
  );
  return { ritualId, decisionId, chambers, unanimous: isUnanimous(chambers) };
}

async function getDecision(db, decisionId) {
  const row = await db.get('SELECT * FROM ontogenesis_decisions WHERE id = ?', [decisionId]);
  if (!row) throw new Error('decision-introuvable');
  return { row, evidence: parseEvidence(row) };
}

async function markRitual(db, update) {
  const merged = { ...update.evidence, status: update.status, ...update.extra };
  await db.run('UPDATE ontogenesis_decisions SET evidence_json = ? WHERE id = ?', [JSON.stringify(merged), update.rowId]);
}

async function closeRitual(db, input) {
  const { row, evidence } = input.ritual;
  const chambers = JSON.parse(row.alternatives_json || '[]');
  if (isUnanimous(chambers)) {
    await markRitual(db, { rowId: row.id, evidence, status: 'closed', extra: { outcome: 'cleared' } });
    return { outcome: 'cleared', chambers };
  }
  const approvalId = await requestApproval(db, {
    projectId: row.project_id, action: `rituel:${evidence.action.scope}`,
    scope: { ritualId: evidence.ritualId, chambers, review: evidence.review }
  });
  await notify(db, { projectId: row.project_id, kind: 'decision_needed', payload: { reason: `rituel-dissentiment:${evidence.ritualId}`, approvalId } });
  await markRitual(db, { rowId: row.id, evidence, status: 'closed', extra: { outcome: 'referred', approvalId } });
  return { outcome: 'referred', chambers, approvalId };
}

async function approvalStatus(db, projectId, approvalId) {
  const row = await db.get('SELECT * FROM ontogenesis_approval_requests WHERE id = ? AND project_id = ?', [approvalId, projectId]);
  return (row && row.status) || 'inconnue';
}

async function settleReferred(db, input) {
  const status = await approvalStatus(db, input.projectId, input.approvalId);
  if (status === 'approved') return { note: 'dispatch-requiert-harnais' };
  if (status === 'denied' && input.taskId) {
    await setTaskStatus(db, { taskId: input.taskId, status: 'blocked' });
    return { note: 'action-refusee' };
  }
  return { note: 'attente-approbation' };
}

async function startRitual(db, input) {
  const failures = await listFailures(db, input.projectId);
  const opened = await openRitual(db, {
    projectId: input.projectId, taskId: input.taskId, action: input.action,
    review: input.review, context: { failures, budgetsOk: input.budgetsOk, reversibility: input.review.reversibility }
  });
  if (opened.unanimous) {
    const closed = await closeRitual(db, { ritual: await getDecision(db, opened.decisionId) });
    if (closed.outcome === 'cleared') return { note: 'dispatch-requiert-harnais' };
  }
  await notify(db, { projectId: input.projectId, kind: 'decision_needed', payload: { reason: `rituel-ouvert:${opened.ritualId}` } });
  return { note: 'rituel-en-cours' };
}

async function ensureDispatchRitual(db, input) {
  const latest = latestRitual(await findRituals(db, { projectId: input.projectId, taskId: input.taskId }));
  if (!latest) return startRitual(db, input);
  if (latest.evidence.status === 'open') {
    const closed = await closeRitual(db, { ritual: latest });
    if (closed.outcome === 'cleared') return { note: 'dispatch-requiert-harnais' };
    return { note: 'rituel-transmis-operateur' };
  }
  if (latest.evidence.outcome === 'cleared') return { note: 'dispatch-requiert-harnais' };
  return settleReferred(db, { projectId: input.projectId, taskId: input.taskId, approvalId: latest.evidence.approvalId });
}

module.exports = { CHAMBERS, evaluateChambers, isUnanimous, openRitual, closeRitual, ensureDispatchRitual, reviewAction };
