const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { rustServer } = require('../../scripts/ci/inventory_mcp');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const nodeSource = fs.readFileSync(path.join(repositoryRoot, 'mcp', 'index.js'), 'utf8');
const sharedSource = fs.readFileSync(path.join(repositoryRoot, 'shared', 'toolDefinitions.json'), 'utf8');
const bundledSource = fs.readFileSync(path.join(repositoryRoot, 'mcp', 'toolDefinitions.json'), 'utf8');
const catalog = JSON.parse(sharedSource);
const canonicalNames = catalog.tools.map((tool) => tool.name);
const bundledNames = JSON.parse(bundledSource).tools.map((tool) => tool.name);
const rust = rustServer();
assert(canonicalNames.includes('genos_replay'), 'canonical catalog must declare genos_replay');
assert(canonicalNames.includes('genos_execute_primitive'), 'canonical catalog must declare genos_execute_primitive');
assert(nodeSource.includes('loadToolCatalog(repoRoot)'), 'Node MCP must load its catalog');
assert.deepStrictEqual(bundledNames.sort(), [...canonicalNames].sort(), 'Node catalog must match the canonical catalog');
assert(rust.canonicalBridge, 'Rust bridged tools must use the canonical catalog');
const expectedRust = canonicalNames.filter((name) => !rust.unavailableInRust.includes(name)).sort();
assert.deepStrictEqual(rust.declaredTools, expectedRust, 'Rust MCP declarations must match the supported catalog subset');
assert.deepStrictEqual(rust.unavailableInRust, [
  'genos_browser_act', 'genos_computer_use', 'genos_foveal_crop', 'genos_optimal_foraging'
]);

console.log('MCP server parity checks passed.');
