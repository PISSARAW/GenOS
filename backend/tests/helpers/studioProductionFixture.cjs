'use strict';
async function seed(spec) {
  const graph = JSON.stringify({ nodes: [{ id: 'start', type: 'input' }, { id: 'done', type: 'output' }],
    edges: [{ source: 'start', target: 'done' }] });
  await spec.db.run(`INSERT INTO workflows(id,workspace_id,name,status,version,graph_json,metadata_json,organization_id,project_id)
    VALUES('studio-app','consumer-ws','Application locale','staging',1,?,'{}','b06-org','b06-project')`, graph);
  await spec.db.run(`INSERT INTO workflow_versions(id,workflow_id,version,graph_json,metadata_json)
    VALUES('studio-app-v1','studio-app',1,?,'{}')`, graph);
}
async function secondVersion(spec) {
  const graph = JSON.stringify({ nodes: [{ id: 'start', type: 'input' }, { id: 'middle', type: 'output' }, { id: 'done', type: 'output' }],
    edges: [{ source: 'start', target: 'middle' }, { source: 'middle', target: 'done' }] });
  await spec.db.run(`INSERT INTO workflow_versions(id,workflow_id,version,graph_json,metadata_json)
    VALUES('studio-app-v2','studio-app',2,?,'{}')`, graph);
  await spec.db.run('UPDATE workflows SET version=2, graph_json=? WHERE id=?', graph, 'studio-app');
}
module.exports = { seed, secondVersion };
