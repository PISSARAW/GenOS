'use strict';

async function initiativeEnvelope(db, task) {
  if (!task?.id) return null;
  const row = await db.get(`SELECT i.kind, i.status, i.mandate_version,
    r.mandate_version AS current_version, r.status AS responsibility_status,
    c.mode AS control_mode, o.valid_until, a.budget_json, a.stop_condition, a.alternative
    FROM shev_initiatives i JOIN shev_responsibilities r ON r.project_id = i.project_id
    JOIN shev_observations o ON o.project_id = i.project_id AND o.id = i.observation_id
    JOIN ontogenesis_control c ON c.project_id = i.project_id
    LEFT JOIN shev_initiative_approvals a ON a.initiative_id = i.id
    WHERE i.task_id = ?`, [task.id]);
  if (!row) return null;
  const blocked = inactiveReason(row);
  if (blocked) return { blocked };
  if (!['investigate', 'experiment'].includes(row.kind)) return null;
  return approvedEnvelope(db, { row, task });
}

function inactiveReason(row) {
  if (row.responsibility_status !== 'active' || row.control_mode !== 'running') return 'shev-controle-inactif';
  if (row.valid_until && Date.parse(row.valid_until) <= Date.now()) return 'shev-preuve-perimee';
  if (row.mandate_version !== row.current_version) return 'shev-mandat-revise';
  if (row.status !== 'queued') return 'shev-initiative-inactive';
  return null;
}

async function approvedEnvelope(db, input) {
  const { row, task } = input;
  if (!row.budget_json) return { blocked: 'shev-approbation-manquante' };
  const budget = JSON.parse(row.budget_json);
  const runs = await db.all('SELECT phase, budgets_json FROM ontogenesis_execution WHERE task_id = ?', [task.id]);
  if (Date.parse(budget.deadlineAt) <= Date.now() || runs.length >= budget.maxAttempts
    || task.attempt >= budget.maxAttempts) return { blocked: 'shev-condition-arret' };
  if (row.stop_condition === 'on-failed-check' && runs.some(run => run.phase === 'failed')) return { blocked: 'shev-condition-arret' };
  const remaining = remainingBudget(budget, runs);
  if (Object.values(remaining).some(value => !Number.isFinite(value) || value <= 0)) return { blocked: 'shev-budget-epuise' };
  return { budget: { ...budget, ...remaining }, stopCondition: row.stop_condition, alternative: row.alternative };
}

function remainingBudget(budget, runs) {
  const reserved = runs.reduce((sum, run) => {
    const used = JSON.parse(run.budgets_json);
    return Object.fromEntries(['tokens', 'usd', 'seconds'].map(key => [key, sum[key] + used[key]]));
  }, { tokens: 0, usd: 0, seconds: 0 });
  const remaining = Object.fromEntries(['tokens', 'usd', 'seconds'].map(key => [key, budget[key] - reserved[key]]));
  remaining.seconds = Math.min(remaining.seconds, Math.floor((Date.parse(budget.deadlineAt) - Date.now()) / 1000));
  return remaining;
}

function clampBudget(allocated, envelope) {
  if (!envelope?.budget) return allocated;
  return Object.fromEntries(['tokens', 'usd', 'seconds'].map((key) =>
    [key, Math.min(allocated[key], envelope.budget[key])]));
}

module.exports = { initiativeEnvelope, clampBudget };
