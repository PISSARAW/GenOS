const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  discoverWorkspaceDirectories,
  isPathWithinRoot,
  syncWorkspaceRegistry,
  workspaceIdForPath
} = require('./src/services/workspaceRegistry');

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

  const discovered = discoverWorkspaceDirectories(root).sort();
  assert.deepStrictEqual(discovered, [nodeProject, rustProject].sort());
  assert.strictEqual(workspaceIdForPath(rustProject), workspaceIdForPath(path.join(root, '.', 'rust-project')));
  assert.strictEqual(isPathWithinRoot(root, rustProject), true);
  assert.strictEqual(isPathWithinRoot(root, path.resolve(root, '..')), false);

  const rowsByName = new Map();
  const database = {
    async run(_sql, id, name, workspacePath, description) {
      const existing = rowsByName.get(name);
      rowsByName.set(name, existing
        ? { ...existing, path: workspacePath, language: 'Mixed' }
        : { id, name, path: workspacePath, language: 'Mixed', description });
    },
    async get(_sql, name) {
      return rowsByName.get(name);
    }
  };
  syncWorkspaceRegistry(database, root).then((registered) => {
    assert.deepStrictEqual(registered.map((workspace) => workspace.name).sort(), ['node-project', 'rust-project']);
    assert.strictEqual(registered.every((workspace) => isPathWithinRoot(root, workspace.path)), true);
    console.log('Workspace registry: ok');
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} finally {
  // The asynchronous registry assertion above needs the fixtures until exit.
  process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));
}
