'use strict';

async function observations(db) {
  const rows = await db.all(`SELECT worker_id,
    AVG(CASE WHEN status = 'completed' THEN json_extract(result_json, '$.metrics.costUsd') END) AS cost,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS failure_rate
    FROM garage_queue WHERE status IN ('completed','failed') GROUP BY worker_id`);
  return Object.fromEntries(rows.map((row) => [row.worker_id, row]));
}

function affinity(row, request) {
  const worker = { name: row.worker_name, role: row.worker_role, about: row.worker_about };
  return require('./workerGarageService').reuseAffinity(worker, { mission: request.prompt, role: request.role })?.score || 0;
}

function cost(row, request, context) {
  const observed = context.observations?.[row.worker_id];
  const estimate = observed?.cost ?? Number(request.estimatedCost || 0);
  return Math.max(0, estimate) + Number(observed?.failure_rate || 0);
}

module.exports = { observations, affinity, cost };
