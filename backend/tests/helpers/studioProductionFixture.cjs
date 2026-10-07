'use strict';
async function seed(spec) {
  const graph = JSON.stringify({ nodes: [{ id: 'start', type: 'input' }, { id: 'done', type: 'output' }],
    edges: [{ source: 'start', target: 'done' }] });
  await spec.db.run(`INSERT INTO workflows(id,workspace_id,name,status,version,graph_json,metadata_json,organization_id,project_id)
    VALUES('studio-app','consumer-ws','Application locale','staging',1,?,'{}','b06-org','b06-project')`, graph);
  await spec.db.run(`INSERT INTO workflow_versions(id,workflow_id,version,graph_json,metadata_json)
    VALUES('studio-app-v1','studio-app',1,?,'{}')`, graph);
}
module.exports = { seed };
