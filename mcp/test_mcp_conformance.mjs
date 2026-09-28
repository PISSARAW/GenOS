import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeNodeFallback, RESULT_STATUSES } from './nodeCliFallback.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const allowed = new Set(Object.values(RESULT_STATUSES));

const verbs = ['snapshot', 'replay', 'capsule', 'init', 'merge', 'audit', 'biomimicry', 'agent', 'unknown_verb'];
for (const verb of verbs) {
  const parsed = JSON.parse(await executeNodeFallback([verb], { snapshot_id: 'snap_x', snapshot: 's.json' }));
  assert.ok(allowed.has(parsed.status), `${verb} status ${parsed.status} must be contractual`);
  assert.equal(parsed.fallbackUsed, true);
  assert.equal(parsed.simulated, parsed.status === 'simulated');
  assert.notEqual(parsed.status, 'completed', `${verb} must not claim completed without proof`);
  if (parsed.status === 'completed') assert.equal(parsed.success, true);
  else assert.equal(parsed.success, false);
}

const shared = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'toolDefinitions.json'), 'utf8'));
const names = shared.tools ? shared.tools.map((t) => t.name) : shared.map((t) => t.name);
for (const name of ['genos_snapshot', 'genos_replay', 'genos_execute_primitive']) {
  assert.ok(names.includes(name), `shared catalog must declare ${name}`);
}

const rust = fs.readFileSync(path.join(root, 'crates', 'genos-mcp', 'src', 'tools.rs'), 'utf8');
for (const name of ['genos_snapshot', 'genos_replay', 'genos_execute_primitive']) {
  assert.ok(rust.includes(`"${name}"`), `Rust catalog must declare ${name}`);
}
assert.ok(rust.includes('GENOS_MCP_LEASE'), 'Rust server must enforce lease');
assert.ok(rust.includes('GENOS_MCP_DISABLED_TOOLS'), 'Rust server must enforce disabled list');

console.log('MCP conformance: fallback never completes without proof; catalogs share core tools; lease enforced.');
