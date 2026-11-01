const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const dbModule = require('../src/db');
const original = dbModule.getDatabase;
dbModule.getDatabase = async () => ({
  get: async () => null,
  all: async () => [],
  run: async () => ({ changes: 0 })
});

const controller = require('../src/controllers/workspaceController');
const { resolveWorkspacesRoot } = require('../src/services/workspaceRegistry');
const vfsSandboxService = require('../src/services/vfsSandboxService');

let created = null;

function response() {
  return {
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

(async () => {
  const rejectedNames = [
    '../escape', '..\\escape', 'a/b', 'a\\b', '..', '.', '/absolute', 'C:\\Windows',
    'CON', 'nul', 'aux', 'com1', 'lpt1', 'trailing.'
  ];
  for (const name of rejectedNames) {
    const res = response();
    await controller.createWorkspace({ body: { name }, headers: {}, tenant: null, user: {} }, res);
    assert.equal(res.code, 400, `name '${name}' must be rejected`);
  }

  const res = response();
  await controller.createWorkspace({ body: { name: 'security-workspace-guard-test' }, headers: {}, tenant: null, user: {} }, res);
  assert.equal(res.code, 201);
  created = res.body.workspace.path;
  const relative = path.relative(path.resolve(resolveWorkspacesRoot()), path.resolve(created));
  assert.equal(relative.startsWith('..'), false);

  const rootPath = process.platform === 'win32' ? 'C:\\' : '/';
  await assert.rejects(
    async () => vfsSandboxService.executeSandboxed('ws-test', 'echo 1', {
      mode: 'real',
      allowRealExecution: true,
      workspaceRoot: rootPath
    }),
    /filesystem root|directory/i
  );

  console.log('Workspace path containment checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (created) fs.rmSync(created, { recursive: true, force: true });
  dbModule.getDatabase = original;
});
