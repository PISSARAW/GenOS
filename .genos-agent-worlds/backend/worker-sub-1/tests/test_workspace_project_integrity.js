const assert = require('assert');
const { getDatabase, closeDatabase } = require('../src/db');

async function run() {
  const db = await getDatabase(':memory:');
  await db.run("INSERT INTO organizations(id, name) VALUES('org-integrity', 'Integrity Org')");
  await db.run("INSERT INTO projects(id, organization_id, name) VALUES('project-integrity', 'org-integrity', 'Integrity Project')");
  await db.run("INSERT INTO workspaces(id, name, path, organization_id, project_id) VALUES('workspace-integrity', 'Integrity Workspace', 'C:/integrity', 'org-integrity', 'project-integrity')");

  await assert.rejects(
    db.run("INSERT INTO workspaces(id, name, path, organization_id, project_id) VALUES('workspace-partial', 'Partial', 'C:/partial', 'org-integrity', NULL)"),
    /organization_id and project_id must be provided together/
  );
  await assert.rejects(
    db.run("INSERT INTO workspaces(id, name, path, organization_id, project_id) VALUES('workspace-wrong-owner', 'Wrong Owner', 'C:/wrong', 'org-integrity', 'project-missing')"),
    /project does not belong to organization/
  );
  await assert.rejects(
    db.run("INSERT INTO workspaces(id, name, path, organization_id, project_id) VALUES('workspace-duplicate', 'Integrity Workspace', 'C:/duplicate', 'org-integrity', 'project-integrity')"),
    /UNIQUE constraint failed/
  );

  await closeDatabase();
  console.log('Workspace/project integrity: ok');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
