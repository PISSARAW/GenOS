'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cartographer = require('../src/services/daemon/cartography/cartographerService');
const graphStore = require('../src/services/daemon/cartography/graphStore');
const jsAdapter = require('../src/services/daemon/cartography/languageAdapters/javascriptAdapter');

async function openDb() {
  const sqlite = require('sqlite');
  const sqlite3 = require('sqlite3');
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  return {
    run: (sql, ...args) => db.run(sql, ...args),
    get: (sql, ...args) => db.get(sql, ...args),
    all: (sql, ...args) => db.all(sql, ...args),
    exec: (sql) => db.exec(sql),
    close: () => db.close()
  };
}

function writeFixture(root) {
  fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(root, 'a.js'), "const { helper } = require('./b');\nfunction foo() { return helper(); }\nclass Bar {}\nmodule.exports = { foo, Bar };\n");
  fs.writeFileSync(path.join(root, 'b.js'), "function helper() { return 1; }\nmodule.exports = { helper };\n");
  fs.writeFileSync(path.join(root, 'sub', 'c.js'), "export const thing = () => 42;\n");
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
}

function normalizeGraph(nodes, edges, territoryId) {
  const normNodes = nodes.map((n) => `${n.kind}::${n.path}::${n.name || ''}::${n.symbol_kind || ''}`).sort();
  const normEdges = edges.map((e) => {
    const src = e.source_id.replace(`${territoryId}::`, '');
    const dst = e.target_id.replace(`${territoryId}::`, '');
    return `${e.relation}::${src}=>${dst}`;
  }).sort();
  return { nodes: normNodes, edges: normEdges };
}

async function snapshotGraph(db, territoryId) {
  const nodes = await graphStore.listNodes(db, { territoryId });
  const edges = await graphStore.listEdges(db, { territoryId });
  return normalizeGraph(nodes, edges, territoryId);
}

async function main() {
  // 1. Adapter : imports relatifs + symboles, rien d'inventé
  const parsed = jsAdapter.parseJavaScript("import x from './b';\nconst y = require('../c');\nimport z from 'external-pkg';\nfunction foo() {}\nclass Bar {}\nconst baz = () => {};\n");
  assert.deepEqual(parsed.imports.sort(), ['../c', './b']);
  const names = parsed.symbols.map((s) => s.name).sort();
  assert.deepEqual(names, ['Bar', 'baz', 'foo']);

  const db = await openDb();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-carto-'));
  writeFixture(root);

  // 2. Full scan : files + dirs + symboles + IMPORTS
  const scanned = await cartographer.scanTerritory(db, { territoryId: 'territory.graph-a', rootPath: root, scopePath: '/' });
  assert.equal(scanned.indexed, 4);
  const nodesA = await graphStore.listNodes(db, { territoryId: 'territory.graph-a' });
  const edgesA = await graphStore.listEdges(db, { territoryId: 'territory.graph-a' });
  assert.ok(nodesA.some((n) => n.kind === 'file' && n.path === 'a.js'));
  assert.ok(nodesA.some((n) => n.kind === 'symbol' && n.name === 'foo'));
  assert.ok(nodesA.some((n) => n.kind === 'symbol' && n.name === 'Bar'));
  assert.ok(edgesA.some((e) => e.relation === 'IMPORTS'));
  assert.ok(edgesA.some((e) => e.relation === 'CONTAINS'));

  // 3. Invariant rebuild == incrémental : scan B sur fixture pristine, puis modifie
  await cartographer.scanTerritory(db, { territoryId: 'territory.graph-b', rootPath: root, scopePath: '/' });
  const before = await snapshotGraph(db, 'territory.graph-b');
  assert.ok(!before.nodes.some((n) => n.includes('brandNew')));
  fs.writeFileSync(path.join(root, 'b.js'), "function helper() { return 2; }\nfunction brandNew() { return 3; }\nmodule.exports = { helper, brandNew };\n");
  await cartographer.updateFiles(db, { territoryId: 'territory.graph-b', rootPath: root, files: ['b.js'] });
  const incremental = await snapshotGraph(db, 'territory.graph-b');
  assert.ok(incremental.nodes.some((n) => n.includes('brandNew')));

  await cartographer.scanTerritory(db, { territoryId: 'territory.graph-c', rootPath: root, scopePath: '/' });
  const rebuilt = await snapshotGraph(db, 'territory.graph-c');
  assert.deepEqual(incremental, rebuilt);

  // 4. Fichier supprimé du graphe après update d'une suppression disque
  fs.unlinkSync(path.join(root, 'sub', 'c.js'));
  await cartographer.updateFiles(db, { territoryId: 'territory.graph-b', rootPath: root, files: ['sub/c.js'] });
  const afterDelete = await graphStore.listNodes(db, { territoryId: 'territory.graph-b', path: 'sub/c.js' });
  assert.equal(afterDelete.length, 0);

  fs.rmSync(root, { recursive: true, force: true });
  await db.close();
  console.log('Daemon cartographer tests passed (adapter, scan, rebuild==incremental, deletion).');
}

main().catch((error) => { console.error(error); process.exit(1); });
