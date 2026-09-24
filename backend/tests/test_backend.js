'use strict';

/**
 * @file test_backend.js
 * @description GenOS Backend Comprehensive Verification Suite
 * Verifies SQLite WAL mode, 18 tables, RBAC security, and all 7 innovation engines.
 */

const path = require('path');
const fs = require('fs');
const { createApp } = require('../src/app');
const { getDatabase, closeDatabase, withTransaction } = require('../src/db');
const { TEST_ADMIN_TOKEN } = require('../testAuth');

const {
  createTestDbPath,
  createTestWorkspacePath,
  setupTestEnvironment,
  cleanupTestFiles,
  createTestRequest,
  createAssert,
} = require('./testUtils');

const { runDatabaseTests } = require('./testDatabase');
const { runSchemaTests } = require('./testSchema');
const { runSecurityTests } = require('./testSecurity');
const { runArenaTests } = require('./testArena');
const { runMcpSandboxTests } = require('./testMcpSandbox');
const { runSwarmTests } = require('./testSwarm');
const { runBiologyTests } = require('./testBiology');
const { runGeneticsTests } = require('./testGenetics');
const { runMemoryTests } = require('./testMemory');
const { runWorkspaceTests } = require('./testWorkspace');
const { runCommandPaletteTests } = require('./testCommandPalette');

const TEST_PORT = 4099;
const MILITARY_OVERRIDE_TOKEN = TEST_ADMIN_TOKEN;

async function runTests() {
  console.log('=== STARTING GENOS BACKEND VERIFICATION SUITE ===\n');
  if (!process.env.GENOS_MCP_LEASE && !process.env.GENOS_MCP_EXPOSE_ALL) {
    process.env.GENOS_MCP_EXPOSE_ALL = '1';
  }

  const testDbPath = createTestDbPath();
  const coreWorkspacePath = createTestWorkspacePath();
  setupTestEnvironment(testDbPath, coreWorkspacePath);

  let actualPort = TEST_PORT;
  let server = null;
  let db = null;
  const passedCount = { count: 0 };
  const failedCount = { count: 0 };

  const assert = createAssert(passedCount, failedCount);

  // Clean up any existing test files
  cleanupTestFiles(testDbPath, coreWorkspacePath);

  db = await getDatabase(testDbPath);
  const app = createApp();
  server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const fallbackServer = http.createServer(app);
        server = fallbackServer;
        fallbackServer.listen(0, () => {
          actualPort = fallbackServer.address().port;
          resolve();
        });
      } else {
        reject(err);
      }
    });
    server.listen(TEST_PORT, () => {
      actualPort = server.address().port;
      resolve();
    });
  });
  console.log(`Test server active on port ${actualPort}\n`);

  const request = createTestRequest(actualPort, MILITARY_OVERRIDE_TOKEN);

  // Setup workspace for tenant-scoped tests
  fs.rmSync(coreWorkspacePath, { recursive: true, force: true });
  await db.run("DELETE FROM workspace_snapshots WHERE workspace_id = 'ws-genos-core'");
  fs.mkdirSync(path.join(coreWorkspacePath, 'src'), { recursive: true });
  fs.writeFileSync(path.join(coreWorkspacePath, 'src', 'parser.js'), 'function parse(input){ if (!input) return null; return input; }\n');
  fs.writeFileSync(path.join(coreWorkspacePath, 'package.json'), JSON.stringify({
    name: 'ws-genos-core',
    version: '0.0.0',
    scripts: { test: 'node -e "const fs=require(\'fs\'); process.exit(fs.readFileSync(\'src/parser.js\', \'utf8\').includes(\'deep.property\') ? 1 : 0)"' }
  }, null, 2));
  await db.run("INSERT OR IGNORE INTO organizations (id, name) VALUES ('org-smoke', 'Smoke Test Organization')");
  await db.run("INSERT OR IGNORE INTO projects (id, organization_id, name) VALUES ('project-smoke', 'org-smoke', 'Smoke Test Project')");
  await db.run(
    "INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('ws-genos-core', 'GenOS Core', ?, 'org-smoke', 'project-smoke') " +
    'ON CONFLICT(id) DO UPDATE SET path = excluded.path, organization_id = excluded.organization_id, project_id = excluded.project_id',
    coreWorkspacePath
  );
  const smokeTenantHeaders = { 'X-Organization-Id': 'org-smoke', 'X-Project-Id': 'project-smoke' };

  try {
    await runDatabaseTests({ db, assert });
    await runSchemaTests({ db, assert });
    await runSecurityTests({ request, assert, token: MILITARY_OVERRIDE_TOKEN });
    await runArenaTests({ request, assert });
    await runMcpSandboxTests({ request, assert });
    await runSwarmTests({ request, assert });
    await runBiologyTests({ request, assert, token: MILITARY_OVERRIDE_TOKEN, smokeTenantHeaders });
    await runGeneticsTests({ request, assert, token: MILITARY_OVERRIDE_TOKEN, smokeTenantHeaders });
    await runMemoryTests({ request, assert, smokeTenantHeaders });
    await runWorkspaceTests({ request, assert, token: MILITARY_OVERRIDE_TOKEN, smokeTenantHeaders, coreWorkspacePath });
    await runCommandPaletteTests({ request, assert, token: MILITARY_OVERRIDE_TOKEN });

    console.log(`\n========================================`);
    console.log(`TEST RESULTS: ${passedCount.count} PASSED, ${failedCount.count} FAILED`);
    console.log(`========================================\n`);
  } finally {
    server.close();
    await closeDatabase();
    cleanupTestFiles(testDbPath, coreWorkspacePath);
  }

  if (failedCount.count > 0) {
    process.exit(1);
  }
  process.exit(0);
}

const http = require('http');
runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});