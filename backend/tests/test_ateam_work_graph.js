const assert = require('node:assert/strict');
const sessions = require('../src/services/topologySessionStore');
const compiler = require('../src/services/aTeam/workGraph/workGraphCompiler');
const graphStore = require('../src/services/aTeam/workGraph/workGraphStore');

const members = [
  { memberId: 'security', subSystem: 'security', role: 'reviewer', capabilities: ['oauth'], dependsOn: [], outputs: ['auth-contract'] },
  { memberId: 'backend', subSystem: 'backend', role: 'engineer', capabilities: ['api'], dependsOn: ['security'], outputs: ['api-contract'] },
  { memberId: 'frontend', subSystem: 'frontend', role: 'engineer', capabilities: ['react'], dependsOn: ['backend'], outputs: ['ui'] },
  { memberId: 'docs', subSystem: 'docs', role: 'writer', capabilities: ['technical-writing'], dependsOn: [] }
];

const graph = compiler.compileWorkGraph({ teamRunId: 'team-1', members });
assert.equal(graph.nodes.length, 4);
assert.deepEqual(graph.layers.map((layer) => [...layer].sort()), [['work:docs:0', 'work:security:0'], ['work:backend:0'], ['work:frontend:0']]);
assert.equal(graph.memberStages.frontend, 2);
assert.deepEqual(graph.criticalPath.nodeIds, ['work:security:0', 'work:backend:0', 'work:frontend:0']);
assert.equal(graph.nodes.find((node) => node.domain === 'security').status, 'READY');
assert.equal(graph.nodes.find((node) => node.domain === 'backend').status, 'BLOCKED');

assert.throws(() => compiler.compileWorkGraph({ members: [...members, {
  memberId: 'unknown', subSystem: 'unknown', role: 'worker', dependsOn: ['not-a-domain']
}] }), { code: 'ATEAM_WORK_GRAPH_UNKNOWN_DEPENDENCY' });
assert.throws(() => compiler.compileWorkGraph({ members: [
  { memberId: 'a', subSystem: 'a', dependsOn: ['b'] },
  { memberId: 'b', subSystem: 'b', dependsOn: ['a'] }
] }), { code: 'ATEAM_WORK_GRAPH_INVALID' });

(async () => {
  const originalSave = sessions.save;
  const originalLoad = sessions.load;
  const records = new Map();
  sessions.save = async (_db, record) => {
    const revision = record.revision === undefined ? 0 : record.revision + 1;
    records.set(record.id, { id: record.id, topology: record.topology, revision, state: record.state });
    return { id: record.id, revision };
  };
  sessions.load = async (_db, id) => records.get(id) || null;
  try {
    const created = await graphStore.create({}, graph);
    const loaded = await graphStore.load({}, created.workGraphId);
    assert.equal(loaded.teamRunId, 'team-1');
    assert.deepEqual(loaded.layers, graph.layers);
    const updated = await graphStore.update({ db: {}, workGraphId: loaded.workGraphId, revision: loaded.revision, graph: { ...graph, status: 'READY' } });
    assert.equal(updated.revision, 1);
    assert.equal(updated.status, 'READY');
  } finally {
    sessions.save = originalSave;
    sessions.load = originalLoad;
  }
  console.log('A-Team WorkGraph compiles DAGs, validates dependencies and persists revisions.');
})().catch((error) => { console.error(error); process.exit(1); });
