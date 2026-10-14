'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.GENOS_ADMIN_PASSWORD ||= 'test-agent-dossier-scope-password';

const { getDatabase, closeDatabase } = require('../src/db');
const { loadAgentDossier } = require('../src/services/agentDossierService');

async function seedTenant(db, tenant) {
  const { organizationId, projectId, workspaceId } = tenant;
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', organizationId, organizationId);
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)', projectId, organizationId, projectId);
  await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    workspaceId, workspaceId, os.tmpdir(), organizationId, projectId);
}

async function addRecord(db, record) {
  const { id, organizationId, projectId } = record;
  await db.run('INSERT INTO genome_decisions (id, title, content, created_by, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?)',
    `decision-${id}`, id, `content-${id}`, 'dossier-agent', organizationId, projectId);
  await db.run('INSERT INTO telemetry_events (agent_id, event_type, action, detail, payload_json, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    'dossier-agent', 'EVIDENCE_REPORT', 'VERIFY', `event-${id}`, JSON.stringify({ marker: id }), organizationId, projectId);
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-agent-dossier-scope-'));
  try {
    const db = await getDatabase(path.join(directory, 'dossier.sqlite'));
    await seedTenant(db, { organizationId: 'org-a', projectId: 'project-a', workspaceId: 'workspace-a' });
    await seedTenant(db, { organizationId: 'org-b', projectId: 'project-b', workspaceId: 'workspace-b' });
    await db.run('INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, ?, ?, ?, ?, ?)',
      'dossier-agent', 'Dossier', 'orchestrator', 'idle', 'orchestrator', 'workspace-a');
    await addRecord(db, { id: 'tenant-a', organizationId: 'org-a', projectId: 'project-a' });
    await addRecord(db, { id: 'tenant-b', organizationId: 'org-b', projectId: 'project-b' });
    await addRecord(db, { id: 'unscoped', organizationId: null, projectId: null });

    const dossier = await loadAgentDossier(db, 'dossier-agent', { organizationId: 'org-a', projectId: 'project-a' });
    assert.deepEqual(dossier.genome.decisions.map((item) => item.id), ['decision-tenant-a']);
    assert.deepEqual(dossier.events.map((item) => item.detail), ['event-tenant-a']);
    assert.deepEqual(dossier.memory.map((item) => item.content.marker), ['tenant-a']);
  } finally {
    await closeDatabase();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
