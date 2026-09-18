'use strict';

async function migrateOntologyRelationScopes(db) {
  const columns = new Set((await db.all('PRAGMA table_info(ontology_relations)')).map(column => column.name));
  if (!columns.has('organization_id')) await db.exec('ALTER TABLE ontology_relations ADD COLUMN organization_id TEXT');
  if (!columns.has('project_id')) await db.exec('ALTER TABLE ontology_relations ADD COLUMN project_id TEXT');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_ontology_rel_scope ON ontology_relations(organization_id, project_id, source_kind, source_id)');
}

module.exports = { migrateOntologyRelationScopes };
