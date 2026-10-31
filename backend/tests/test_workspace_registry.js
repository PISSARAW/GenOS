const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  discoverWorkspaceDirectories,
  isPathWithinRoot,
  syncWorkspaceRegistry,
  workspaceIdForPath
} = require('../src/services/workspaceRegistry');
const { resolveMissionWorkspace } = require('../bin/missionWorkspaceScope.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-workspaces-'));

try {
  const rustProject = path.join(root, 'rust-project');
  const nodeProject = path.join(root, 'node-project');
  const ignored = path.join(root, 'node_modules');
  const nestedProject = path.join(root, 'container', 'nested-project');

  fs.mkdirSync(rustProject);
  fs.writeFileSync(path.join(rustProject, 'Cargo.toml'), '[package]\nname = "fixture"\n');
  fs.mkdirSync(nodeProject);
  fs.mkdirSync(path.join(nodeProject, '.git'));
  fs.mkdirSync(ignored);
  fs.writeFileSync(path.join(ignored, 'package.json'), '{}');
  fs.mkdirSync(nestedProject, { recursive: true });
  fs.writeFileSync(path.join(nestedProject, 'package.json'), '{}');
  const firstGenosRoot = path.join(root, 'first', 'GenOS');
  const secondGenosRoot = path.join(root, 'second', 'GenOS');
  fs.mkdirSync(firstGenosRoot, { recursive: true });
  fs.mkdirSync(secondGenosRoot, { recursive: true });
  fs.writeFileSync(path.join(firstGenosRoot, 'Cargo.toml'), '[package]\nname = "first"\n');
  fs.writeFileSync(path.join(secondGenosRoot, 'Cargo.toml'), '[package]\nname = "second"\n');

  const discovered = discoverWorkspaceDirectories(root).sort();
  assert.deepStrictEqual(discovered, [nodeProject, rustProject].sort());
  assert.strictEqual(workspaceIdForPath(rustProject), workspaceIdForPath(path.join(root, '.', 'rust-project')));
  assert.strictEqual(isPathWithinRoot(root, rustProject), true);
  assert.strictEqual(isPathWithinRoot(root, path.resolve(root, '..')), false);
  assert.strictEqual(isPathWithinRoot(root, root), true);
  assert.strictEqual(isPathWithinRoot(root, root, { allowRoot: false }), false);
  assert.strictEqual(isPathWithinRoot(root, rustProject, { allowRoot: false }), true);

  const rowsById = new Map();
  const database = {
    async run(_sql, id, name, workspacePath, description, organizationId, projectId) {
      const existing = rowsById.get(id);
      rowsById.set(id, existing
        ? { ...existing, path: workspacePath, name, language: 'Mixed',
          organization_id: existing.organization_id || organizationId,
          project_id: existing.project_id || projectId }
        : { id, name, path: workspacePath, language: 'Mixed', description,
          organization_id: organizationId, project_id: projectId });
    },
    async get(sql, ...params) {
      if (sql.includes('COALESCE(organization_id')) {
        return [...rowsById.values()].find((row) => (row.organization_id || '') === (params[0] || '')
          && (row.project_id || '') === (params[1] || '') && row.name === params[2]);
      }
      return rowsById.get(params[0]);
    },
    async all() {
      return [...rowsById.values()];
    }
  };
  rowsById.set('tenant-anchor', { id: 'tenant-anchor', name: 'Tenant anchor',
    path: root, organization_id: 'org-test', project_id: 'project-test' });
  syncWorkspaceRegistry(database, root).then(async (registered) => {
    assert.deepStrictEqual(registered.map((workspace) => workspace.name).sort(), ['node-project', 'rust-project']);
    assert.strictEqual(registered.every((workspace) => isPathWithinRoot(root, workspace.path)), true);
    const first = await syncWorkspaceRegistry(database, firstGenosRoot);
    const second = await syncWorkspaceRegistry(database, secondGenosRoot);
    assert.equal(first[0].name, 'GenOS');
    assert.notEqual(second[0].name, 'GenOS');
    const adopted = await resolveMissionWorkspace(database, { workspaceRoot: firstGenosRoot,
      workspaceScopeId: 'tenant-anchor' });
    assert.equal(adopted.organization_id, 'org-test', 'explicit scope must attach a legacy unscoped path');
    assert.equal(adopted.project_id, 'project-test');
    await assert.rejects(resolveMissionWorkspace(database, { workspaceRoot: nestedProject }),
      { code: 'ORCHESTRATOR_WORKSPACE_SCOPE_REQUIRED' });
    const scoped = await resolveMissionWorkspace(database, { workspaceRoot: nestedProject,
      workspaceScopeId: 'tenant-anchor' });
    assert.equal(scoped.organization_id, 'org-test');
    assert.equal(scoped.project_id, 'project-test');
    const repeated = await resolveMissionWorkspace(database, { workspaceRoot: nestedProject,
      workspaceScopeId: 'tenant-anchor' });
    assert.equal(repeated.id, scoped.id);
    console.log('Workspace registry: ok');
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} finally {
  // The asynchronous registry assertion above needs the fixtures until exit.
  process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));
}
