'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../../db');
const { addTask } = require('./projectStore');
const { migrateOntogenesisDaemonStewardship } = require('../../db/migrations/migrateOntogenesisDaemonStewardship');

const ALLOWED_STATUSES = ['REPAIRABLE', 'CAUSALLY_SUPPORTED', 'REPRODUCED'];
const DEFAULT_POLICY = Object.freeze({
  enabled: true,
  autoEnqueue: true,
  eligibleStatuses: ['REPAIRABLE'],
  maxOpenTasks: 3,
  requireLiveDaemon: true
});

function policyOf(config) {
  const supplied = config?.daemonStewardship || {};
  return { ...DEFAULT_POLICY, ...supplied };
}

function digest(prefix, parts) {
  const hash = crypto.createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 32);
  return `${prefix}_${hash}`;
}

function eligible(snapshot, policy) {
  if (!snapshot?.available || !snapshot.fresh) return [];
  const statuses = new Set(policy.eligibleStatuses);
  return snapshot.findings.filter((finding) => statuses.has(finding.status));
}

function priorityOf(finding, snapshot) {
  const bases = { REPAIRABLE: 80, CAUSALLY_SUPPORTED: 65, REPRODUCED: 55 };
  const phenotype = Math.max(0, ...snapshot.activePhenotypes.map((item) => Number(item.pressure || 0)));
  const marker = Math.max(0, ...snapshot.attention
    .filter((item) => item.scope === finding.scope.value).map((item) => Math.abs(Number(item.intensity || 0))));
  return Math.min(100, Math.round((bases[finding.status] || 40) + phenotype * 10 + Math.min(marker, 10)));
}

function taskSpec(projectId, finding, snapshot) {
  const parts = [projectId, snapshot.territoryId, finding.id, snapshot.headSha];
  const scope = `${finding.scope.type}:${finding.scope.value}`;
  return {
    proposalId: digest('daemon_proposal', parts),
    taskId: digest('daemon_task', parts),
    projectId,
    title: `Daemon: ${finding.claim}`.slice(0, 240),
    priority: priorityOf(finding, snapshot),
    acceptance: [
      `Traiter le finding Daemon ${finding.id} au HEAD ${snapshot.headSha}`,
      `Respecter le périmètre déclaré ${scope}`,
      'Produire les preuves exécutables requises par les checks du projet',
      'Ne pas considérer le finding Daemon comme une preuve de réussite'
    ],
    provenance: {
      schema: 'genos.ontogenesis-daemon-proposal/v1',
      authority: 'advisory', territoryId: snapshot.territoryId,
      findingId: finding.id, findingStatus: finding.status,
      headSha: snapshot.headSha, sensoryFingerprint: snapshot.fingerprint,
      scope: finding.scope
    }
  };
}

async function openCount(db, projectId) {
  const row = await db.get(
    `SELECT COUNT(*) AS count FROM ontogenesis_daemon_proposals p
     JOIN ontogenesis_backlog b ON b.id = p.task_id
     WHERE p.project_id = ? AND p.status = 'ENQUEUED'
       AND b.status IN ('todo', 'doing', 'verifying', 'integrating')`, [projectId]
  );
  return Number(row?.count || 0);
}

async function retireObsolete(db, input) {
  const valid = new Set(input.findings.map((finding) => finding.id));
  const rows = await db.all(
    `SELECT p.id, p.finding_id, p.head_sha, p.task_id FROM ontogenesis_daemon_proposals p
     JOIN ontogenesis_backlog b ON b.id = p.task_id
     WHERE p.project_id = ? AND p.status = 'ENQUEUED' AND b.status = 'todo'`, [input.projectId]
  );
  let retired = 0;
  for (const row of rows) {
    if (row.head_sha === input.headSha && valid.has(row.finding_id)) continue;
    await db.run("UPDATE ontogenesis_backlog SET status = 'blocked', updated_at = datetime('now') WHERE id = ?", [row.task_id]);
    await db.run("UPDATE ontogenesis_daemon_proposals SET status = 'STALE', updated_at = datetime('now') WHERE id = ?", [row.id]);
    retired += 1;
  }
  return retired;
}

async function enqueue(db, spec) {
  const inserted = await db.run(
    `INSERT OR IGNORE INTO ontogenesis_daemon_proposals
       (id, project_id, territory_id, finding_id, head_sha, status, priority, proposal_json)
     VALUES (?, ?, ?, ?, ?, 'PROPOSED', ?, ?)`,
    [spec.proposalId, spec.projectId, spec.provenance.territoryId, spec.provenance.findingId,
      spec.provenance.headSha, spec.priority, JSON.stringify(spec.provenance)]
  );
  if (inserted.changes !== 1) return false;
  await addTask(db, { ...spec, id: spec.taskId });
  await db.run(
    "UPDATE ontogenesis_daemon_proposals SET task_id = ?, status = 'ENQUEUED', updated_at = datetime('now') WHERE id = ?",
    [spec.taskId, spec.proposalId]
  );
  return true;
}

async function enqueueAvailable(db, input) {
  let slots = Math.max(0, input.policy.maxOpenTasks - await openCount(db, input.projectId));
  let enqueued = 0;
  const ranked = input.findings.map((finding) => taskSpec(input.projectId, finding, input.snapshot))
    .sort((left, right) => right.priority - left.priority || left.taskId.localeCompare(right.taskId));
  for (const spec of ranked) {
    if (slots <= 0) break;
    if (await enqueue(db, spec)) { enqueued += 1; slots -= 1; }
  }
  return enqueued;
}

async function reconcileFresh(db, input) {
  const retired = await retireObsolete(db, {
    projectId: input.project.id, headSha: input.snapshot.headSha, findings: input.findings
  });
  if (input.policy.requireLiveDaemon && input.snapshot.daemon?.live !== true) {
    return { enabled: true, enqueued: 0, retired, eligible: input.findings.length, reason: 'daemon-not-live' };
  }
  const enqueued = await enqueueAvailable(db, {
    policy: input.policy, projectId: input.project.id,
    findings: input.findings, snapshot: input.snapshot
  });
  return { enabled: true, enqueued, retired, eligible: input.findings.length };
}

async function reconcileBacklog(db, input) {
  await migrateOntogenesisDaemonStewardship(db);
  const policy = policyOf(input.config);
  if (!policy.enabled || !policy.autoEnqueue) return { enabled: false, enqueued: 0, retired: 0 };
  const findings = eligible(input.snapshot, policy);
  if (!input.snapshot?.available || !input.snapshot.fresh) return { enabled: true, enqueued: 0, retired: 0 };
  return withTransaction(db, () => reconcileFresh(db, { ...input, policy, findings }));
}

async function recordIntegration(db, input) {
  await migrateOntogenesisDaemonStewardship(db);
  const result = JSON.stringify({ outcome: 'integrated', sha: input.sha, integratedAt: new Date().toISOString() });
  const updated = await db.run(
    `UPDATE ontogenesis_daemon_proposals SET status = 'INTEGRATED', result_json = ?, updated_at = datetime('now')
     WHERE project_id = ? AND task_id = ? AND status = 'ENQUEUED'`,
    [result, input.projectId, input.taskId]
  );
  return { recorded: updated.changes === 1 };
}

async function recordFailure(db, input) {
  await migrateOntogenesisDaemonStewardship(db);
  const result = JSON.stringify({
    outcome: 'attempt_failed', reason: String(input.reason || '').slice(0, 500),
    observedAt: new Date().toISOString()
  });
  const updated = await db.run(
    `UPDATE ontogenesis_daemon_proposals SET result_json = ?, updated_at = datetime('now')
     WHERE project_id = ? AND task_id = ? AND status = 'ENQUEUED'`,
    [result, input.projectId, input.taskId]
  );
  return { recorded: updated.changes === 1 };
}

async function summarize(db, projectId) {
  await migrateOntogenesisDaemonStewardship(db);
  const rows = await db.all(
    'SELECT status, COUNT(*) AS count FROM ontogenesis_daemon_proposals WHERE project_id = ? GROUP BY status',
    [projectId]
  );
  const counts = Object.fromEntries(rows.map((row) => [row.status.toLowerCase(), Number(row.count)]));
  return { proposals: rows.reduce((sum, row) => sum + Number(row.count), 0), ...counts };
}

module.exports = {
  ALLOWED_STATUSES, DEFAULT_POLICY, policyOf,
  reconcileBacklog, recordIntegration, recordFailure, summarize
};
