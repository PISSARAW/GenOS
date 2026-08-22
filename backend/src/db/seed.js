/**
 * Minimal, idempotent database bootstrap for a local Studio installation.
 */

const crypto = require('crypto');
const path = require('path');
const { seedMcpTools } = require('./seedTools');
const strategyContracts = require('../services/strategyContractService');

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function ensureConfiguredWorkspace(db) {
  // A multi-workspace deployment discovers projects under the plural root.
  // Keep this legacy bootstrap only for single explicit workspace installs.
  if (String(process.env.GENOS_WORKSPACES_ROOT || '').trim()) return;
  const workspaceRoot = String(process.env.GENOS_WORKSPACE_ROOT || '').trim();
  if (!workspaceRoot) return;

  const name = String(process.env.GENOS_WORKSPACE_NAME || path.basename(workspaceRoot) || 'workspace').trim();
  await db.run(
    `INSERT INTO workspaces (id, name, path, visibility, language, description, tags)
     VALUES ('ws-local', ?, ?, 'Private', 'Mixed', ?, '[]')
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, path = excluded.path`,
    name,
    workspaceRoot,
    'Workspace mounted through GENOS_WORKSPACE_ROOT.'
  );
}

async function ensureWorkspaceDashboardData(db) {
  const workspaces = await db.all('SELECT id, name FROM workspaces ORDER BY created_at ASC');

  for (const workspace of workspaces) {
    const slug = workspace.id.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    const alert = await db.get('SELECT id FROM global_alerts WHERE workspace_name = ? LIMIT 1', workspace.name);
    if (!alert) {
      await db.run(
        `INSERT INTO global_alerts (id, title, status, agent_name, workspace_name, severity, confidence, context_snapshot)
         VALUES (?, ?, 'running', 'workspace_controller', ?, 'low', '100%', ?)`,
        `alert-${slug}-initialized`,
        `Workspace ${workspace.name} initialized`,
        workspace.name,
        'Workspace dashboard is connected to the GenOS backend.'
      );
    }
  }
}

async function ensureAgentStrategyContracts(db) {
  const agents = await db.all(`SELECT a.id, a.workspace_id, a.current_task, a.role,
      sc.contract_json AS latest_contract_json
    FROM agents a
    LEFT JOIN strategy_contracts sc ON sc.agent_id = a.id
      AND sc.version = (SELECT MAX(latest.version) FROM strategy_contracts latest WHERE latest.agent_id = a.id)`);
  for (const agent of agents) {
    let latestContract = null;
    try {
      latestContract = agent.latest_contract_json ? JSON.parse(agent.latest_contract_json) : null;
    } catch {
      // A malformed legacy snapshot is replaced below while remaining in history.
    }
    if (latestContract?.strategy_decision_summary?.total_registry === 77
      && latestContract?.strategy_decisions?.length === 77) continue;

    await strategyContracts.saveContract(db, {
      agentId: agent.id,
      workspaceId: agent.workspace_id,
      problem: agent.current_task || `Autonomous task execution for ${agent.role}`,
      createdBy: latestContract ? 'strategy_registry_upgrade' : 'strategy_contract_migration'
    });
  }
}

async function ensureAdminKey(db) {
  const existing = await db.get('SELECT COUNT(*) as count FROM access_keys');
  const configured = String(process.env.GENOS_ADMIN_TOKEN || '').trim();
  if (!existing || existing.count === 0) {
    const rawKey = configured || `genos_sk_admin_${crypto.randomBytes(24).toString('hex')}`;
    await db.run(
      'INSERT INTO access_keys (id, key_hash, label, role, permissions) VALUES (?, ?, ?, ?, ?)',
      'key-bootstrap-admin',
      hashKey(rawKey),
      'Bootstrap administrator',
      'admin',
      JSON.stringify(['all'])
    );

    if (!configured) {
      console.warn('[GenOS Bootstrap] Generated one-time administrator token:');
      console.warn(rawKey);
      console.warn('[GenOS Bootstrap] Save it now; it is stored only as a hash.');
    }
  }

  if (process.env.NODE_ENV === 'test') {
    const fixtures = [
      ['key-test-operator', process.env.GENOS_TEST_OPERATOR_TOKEN, 'operator'],
      ['key-test-viewer', process.env.GENOS_TEST_VIEWER_TOKEN, 'viewer']
    ];
    for (const [id, rawKey, role] of fixtures) {
      if (!rawKey) continue;
      await db.run(
        'INSERT OR REPLACE INTO access_keys (id, key_hash, label, role, permissions) VALUES (?, ?, ?, ?, ?)',
        id,
        hashKey(rawKey),
        `Test ${role}`,
        role,
        '[]'
      );
    }
  }
}

async function seedDatabase(db) {
  await ensureConfiguredWorkspace(db);
  await ensureWorkspaceDashboardData(db);
  await ensureAdminKey(db);
  await seedMcpTools(db);
  // This runs on every boot so existing databases receive the strategy migration too.
  await ensureAgentStrategyContracts(db);
}

module.exports = { seedDatabase, hashKey, ensureAgentStrategyContracts };
