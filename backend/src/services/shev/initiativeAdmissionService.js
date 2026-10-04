'use strict';

async function initiativeEnvelope(db, task) {
  if (!task?.id) return null;
  const row = await db.get(`SELECT i.kind, i.status, i.mandate_version,
    r.mandate_version AS current_version, a.budget_json, a.stop_condition
    FROM shev_initiatives i JOIN shev_responsibilities r ON r.project_id = i.project_id
    LEFT JOIN shev_initiative_approvals a ON a.initiative_id = i.id
    WHERE i.task_id = ?`, [task.id]);
  if (!row) return null;
  if (row.mandate_version !== row.current_version) return { blocked: 'shev-mandat-revise' };
  if (row.status !== 'queued') return { blocked: 'shev-initiative-inactive' };
  if (!['investigate', 'experiment'].includes(row.kind)) return null;
  if (!row.budget_json) return { blocked: 'shev-approbation-manquante' };
  const budget = JSON.parse(row.budget_json);
  if (Date.parse(budget.deadlineAt) <= Date.now() || task.attempt >= budget.maxAttempts) {
    return { blocked: 'shev-condition-arret' };
  }
  return { budget, stopCondition: row.stop_condition };
}

function clampBudget(allocated, envelope) {
  if (!envelope?.budget) return allocated;
  return Object.fromEntries(['tokens', 'usd', 'seconds'].map((key) =>
    [key, Math.min(allocated[key], envelope.budget[key])]));
}

module.exports = { initiativeEnvelope, clampBudget };
