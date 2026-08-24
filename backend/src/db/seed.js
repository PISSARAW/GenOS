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

function workspaceInitializationAlertId(workspaceId) {
  // A slug is not unique (`foo_bar` and `foo-bar` produce the same one).  Use
  // a bounded, deterministic hash so every workspace has a collision-resistant
  // bootstrap key that remains stable across restarts.
  const digest = crypto.createHash('sha256').update(String(workspaceId)).digest('hex').slice(0, 24);
  return `alert-workspace-${digest}-initialized`;
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
    const alert = await db.get('SELECT id FROM global_alerts WHERE workspace_name = ? LIMIT 1', workspace.name);
    if (!alert) {
      await db.run(
        `INSERT INTO global_alerts (id, title, status, agent_name, workspace_name, severity, confidence, context_snapshot)
         VALUES (?, ?, 'running', 'workspace_controller', ?, 'low', '100%', ?)
         ON CONFLICT(id) DO NOTHING`,
        workspaceInitializationAlertId(workspace.id),
        `Workspace ${workspace.name} initialized`,
        workspace.name,
        'Workspace dashboard is connected to the GenOS backend.'
      );
    }
  }
}

async function ensureAgentStrategyContracts(db) {
  const agents = await db.all(`SELECT a.id, a.workspace_id, a.current_task, a.role, a.execution_mode,
      sc.contract_json AS latest_contract_json
    FROM agents a
    LEFT JOIN strategy_contracts sc ON sc.agent_id = a.id
      AND sc.version = (SELECT MAX(latest.version) FROM strategy_contracts latest WHERE latest.agent_id = a.id)`);
  for (const agent of agents) {
    if (agent.execution_mode === 'worker') continue;
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

async function ensureDefaultUser(db) {
  const existing = await db.get('SELECT COUNT(*) as count FROM users');
  if (existing && existing.count > 0) return;

  const username = String(process.env.GENOS_ADMIN_USERNAME || 'admin').trim() || 'admin';
  const password = String(process.env.GENOS_ADMIN_PASSWORD || 'genos-admin');
  const { hashPassword } = require('../controllers/password');
  await db.run(
    'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)',
    `user-${Date.now()}`,
    username,
    hashPassword(password),
    'admin'
  );
  console.warn(`[GenOS Bootstrap] Default local user created: ${username} (role: admin).`);
  if (!process.env.GENOS_ADMIN_PASSWORD) {
    console.warn('[GenOS Bootstrap] Default password is "genos-admin" — change it or set GENOS_ADMIN_PASSWORD.');
  }
}

async function seedDatabase(db) {
  await ensureConfiguredWorkspace(db);
  await ensureWorkspaceDashboardData(db);
  await ensureAdminKey(db);
  await ensureDefaultUser(db);
  await seedMcpTools(db);
  // This runs on every boot so existing databases receive the strategy migration too.
  await ensureAgentStrategyContracts(db);
}

module.exports = { seedDatabase, hashKey, ensureAgentStrategyContracts, workspaceInitializationAlertId };
