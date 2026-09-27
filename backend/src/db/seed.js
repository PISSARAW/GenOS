/** Minimal idempotant DB bootstrap for local Studio. */
const crypto = require('crypto');
const path = require('path');
const { seedMcpTools } = require('./seedTools');
const strategyContracts = require('../services/strategyContractService');
const { listStrategies } = require('../strategies/strategyRegistry');

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function workspaceInitializationAlertId(workspaceId) {
  const digest = crypto.createHash('sha256').update(String(workspaceId)).digest('hex').slice(0, 24);
  return `alert-workspace-${digest}-initialized`;
}

async function ensureConfiguredWorkspace(db) {
  if (String(process.env.GENOS_WORKSPACES_ROOT || '').trim()) return;
  const workspaceRoot = String(process.env.GENOS_WORKSPACE_ROOT || '').trim();
  if (!workspaceRoot) return;
  let name = String(process.env.GENOS_WORKSPACE_NAME || path.basename(workspaceRoot) || 'workspace').trim();
  try {
    await db.run(
      `INSERT INTO workspaces (id, name, path, visibility, language, description, tags)
       VALUES ('ws-local', ?, ?, 'Private', 'Mixed', ?, '[]')
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, path = excluded.path`,
      name, workspaceRoot, 'Workspace mounted through GENOS_WORKSPACE_ROOT.'
    );
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      await db.run(`UPDATE workspaces SET path = ? WHERE id = 'ws-local'`, workspaceRoot).catch(() => {});
    } else {
      throw err;
    }
  }
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
        `Workspace ${workspace.name} initialized`, workspace.name, 'Workspace dashboard is connected to the GenOS backend.'
      );
    }
  }
}

async function fetchAgentsWithContracts(db) {
  return db.all(`SELECT a.id, a.workspace_id, a.current_task, a.role, a.execution_mode,
      sc.contract_json AS latest_contract_json
    FROM agents a
    LEFT JOIN strategy_contracts sc ON sc.agent_id = a.id
      AND sc.version = (SELECT MAX(latest.version) FROM strategy_contracts latest WHERE latest.agent_id = a.id)`);
}

async function fetchWorkspaceIdSet(db) {
  const workspaces = await db.all('SELECT id FROM workspaces');
  return new Set(workspaces.map((w) => w.id));
}

async function repairAgentWorkspace(db, agent, workspaceIds) {
  if (agent.workspace_id && !workspaceIds.has(agent.workspace_id)) {
    await db.run('UPDATE agents SET workspace_id = NULL WHERE id = ?', agent.id).catch(() => {});
    agent.workspace_id = null;
  }
}

function parseContractSnapshot(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function needsContractUpgrade(latestContract, totalRegistryCount) {
  if (!latestContract) return true;
  const summaryOk = latestContract?.strategy_decision_summary?.total_registry === totalRegistryCount;
  const decisionsOk = latestContract?.strategy_decisions?.length === totalRegistryCount;
  return !(summaryOk && decisionsOk);
}

async function upgradeAgentContract(db, agent, upgrade) {
  if (!needsContractUpgrade(upgrade.latestContract, upgrade.totalRegistryCount)) return;
  await strategyContracts.saveContract(db, {
    agentId: agent.id,
    workspaceId: agent.workspace_id,
    problem: agent.current_task || `Autonomous task execution for ${agent.role}`,
    createdBy: upgrade.latestContract ? 'strategy_registry_upgrade' : 'strategy_contract_migration'
  });
}

async function ensureAgentStrategyContracts(db) {
  const agents = await fetchAgentsWithContracts(db);
  const totalRegistryCount = listStrategies().length;
  const workspaceIds = await fetchWorkspaceIdSet(db);
  for (const agent of agents) {
    if (agent.execution_mode === 'worker') continue;
    await repairAgentWorkspace(db, agent, workspaceIds);
    const latestContract = parseContractSnapshot(agent.latest_contract_json);
    await upgradeAgentContract(db, agent, { latestContract, totalRegistryCount });
  }
}

async function syncBootstrapKey(db, bootstrap, configured) {
  if (bootstrap && configured && bootstrap.key_hash !== hashKey(configured)) {
    await db.run('UPDATE access_keys SET key_hash = ? WHERE id = ?', hashKey(configured), bootstrap.id);
  }
}

async function mintBootstrapKeyIfEmpty(db, configured) {
  const existing = await db.get('SELECT COUNT(*) as count FROM access_keys');
  if (existing && existing.count > 0) return;
  const rawKey = configured || `genos_sk_admin_${crypto.randomBytes(24).toString('hex')}`;
  await db.run(
    'INSERT INTO access_keys (id, key_hash, label, role, permissions) VALUES (?, ?, ?, ?, ?)',
    'key-bootstrap-admin', hashKey(rawKey), 'Bootstrap administrator', 'admin', JSON.stringify(['all'])
  );
  if (!configured) {
    console.warn('[GenOS Bootstrap] Generated one-time administrator token and stored only its hash. Configure GENOS_ADMIN_TOKEN before startup to provide a credential.');
  }
}

async function ensureConfiguredTestKey(db, configured) {
  if (!configured) return;
  const match = await db.get('SELECT id FROM access_keys WHERE key_hash = ?', hashKey(configured));
  if (match) return;
  await db.run(
    'INSERT OR REPLACE INTO access_keys (id, key_hash, label, role, permissions) VALUES (?, ?, ?, ?, ?)',
    'key-test-admin', hashKey(configured), 'Test admin', 'admin', '[]'
  );
}

async function ensureFixtureTestKeys(db) {
  const fixtures = [
    ['key-test-operator', process.env.GENOS_TEST_OPERATOR_TOKEN, 'operator'],
    ['key-test-viewer', process.env.GENOS_TEST_VIEWER_TOKEN, 'viewer']
  ];
  for (const [id, rawKey, role] of fixtures) {
    if (!rawKey) continue;
    await db.run(
      'INSERT OR REPLACE INTO access_keys (id, key_hash, label, role, permissions) VALUES (?, ?, ?, ?, ?)',
      id, hashKey(rawKey), `Test ${role}`, role, '[]'
    );
  }
}

async function ensureAdminKey(db) {
  const configured = String(process.env.GENOS_ADMIN_TOKEN || '').trim();
  const bootstrap = await db.get("SELECT id, key_hash FROM access_keys WHERE id = 'key-bootstrap-admin'");
  if (bootstrap) {
    await syncBootstrapKey(db, bootstrap, configured);
  } else {
    await mintBootstrapKeyIfEmpty(db, configured);
  }
  if (process.env.NODE_ENV === 'test') {
    await ensureConfiguredTestKey(db, configured);
    await ensureFixtureTestKeys(db);
  }
}

async function ensureDefaultUser(db) {
  const existing = await db.get('SELECT COUNT(*) as count FROM users');
  if (existing && existing.count > 0) return;
  const username = String(process.env.GENOS_ADMIN_USERNAME || 'admin').trim() || 'admin';
  if (!process.env.GENOS_ADMIN_PASSWORD && process.env.NODE_ENV !== 'test') {
    throw new Error('GENOS_ADMIN_PASSWORD must be configured before creating the default administrator.');
  }
  const password = String(process.env.GENOS_ADMIN_PASSWORD || `genos_test_password_${crypto.randomBytes(24).toString('hex')}`);
  const { hashPassword } = require('../controllers/password');
  await db.run(
    'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)',
    `user-${Date.now()}`, username, hashPassword(password), 'admin'
  );
  console.warn(`[GenOS Bootstrap] Default local user created: ${username} (role: admin).`);
}

async function ensureDefaultWorkspace(db) {
  await db.run(
    `INSERT OR IGNORE INTO workspaces (id, name, path, visibility, language, description, tags)
     VALUES ('ws-genos-core', 'GenOS Core', '.', 'Private', 'Mixed', 'Canonical default workspace used as global fallback.', '[]')`
  );
}

async function seedDatabase(db) {
  await ensureConfiguredWorkspace(db);
  await ensureDefaultWorkspace(db);
  await ensureWorkspaceDashboardData(db);
  await ensureAdminKey(db);
  await ensureDefaultUser(db);
  await seedMcpTools(db);
  // This runs on every boot so existing databases receive the strategy migration too.
  await ensureAgentStrategyContracts(db);
}

module.exports = { seedDatabase, hashKey, ensureAgentStrategyContracts, workspaceInitializationAlertId };
