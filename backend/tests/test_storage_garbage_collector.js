const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runCasGc, runDagSweep } = require('../src/services/storageGarbageCollector');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-cas-'));
  fs.mkdirSync(path.join(root, 'refs'));
  fs.writeFileSync(path.join(root, 'live'), 'live');
  fs.writeFileSync(path.join(root, 'dead'), 'dead');
  fs.writeFileSync(path.join(root, 'refs', 'root.json'), JSON.stringify({ hash: 'live' }));
  const dry = runCasGc({ casRoot: root, dryRun: true });
  assert.equal(dry.success, false);
  assert.equal(dry.status, 'simulated');
  const live = runCasGc({ casRoot: root });
  assert.equal(live.success, true);
  assert.equal(fs.existsSync(path.join(root, 'live')), true);
  assert.equal(fs.existsSync(path.join(root, 'dead')), false);
  fs.rmSync(root, { recursive: true, force: true });

  const rows = { nodes: [{ id: 'root' }, { id: 'child' }, { id: 'orphan' }], edges: [{ source_node_id: 'root', target_node_id: 'child' }] };
  const db = {
    all: async (sql) => sql.includes('lineage_nodes') ? rows.nodes : rows.edges,
    run: async () => ({ changes: 1 })
  };
  const scan = await runDagSweep({ db, rootNodeIds: ['root'] });
  assert.equal(scan.status, 'simulated');
  const pruned = await runDagSweep({ db, rootNodeIds: ['root'], prune: true });
  assert.equal(pruned.success, true);
  assert.deepEqual(pruned.unreachableNodes, ['orphan']);
}

main().then(() => console.log('CAS and DAG garbage collection checks passed.'));
