const fs = require('fs');
const path = require('path');

const { packBioPolymer } = require('./bioPolymerPersistenceService');
const { decodeBuffer, decodeFile, workerGenes } = require('./agentDna');

function walkDnaFiles(directory, out) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walkDnaFiles(full, out);
    else if (entry.name.endsWith('.dna')) out.push(full);
  }
  return out;
}

function genomeKey(prefix, name) {
  if (prefix) return `${prefix}${name}`;
  return name;
}

async function saveGenome(db, model, options) {
  const opts = options || {};
  const id = opts.id || model.meta.name;
  const provenance = model.provenance || {};
  const phenotypeBlob = packBioPolymer(model.phenotype);
  await db.run(
    `INSERT INTO agent_genomes (id, agent_id, name, content_hash, genome_blob, phenotype_blob, source_manifest, source_doc, organization_id, project_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET agent_id = excluded.agent_id, name = excluded.name, content_hash = excluded.content_hash,
       genome_blob = excluded.genome_blob, phenotype_blob = excluded.phenotype_blob, source_manifest = excluded.source_manifest,
       source_doc = excluded.source_doc, organization_id = excluded.organization_id, project_id = excluded.project_id,
       updated_at = CURRENT_TIMESTAMP`,
    id,
    opts.agentId || null,
    model.meta.name,
    model.contentHash,
    model.raw,
    phenotypeBlob,
    provenance.sourceManifest || null,
    provenance.sourceDoc || null,
    opts.organizationId || null,
    opts.projectId || null
  );
  return { id, name: model.meta.name, contentHash: model.contentHash };
}

async function loadGenome(db, key) {
  let row = null;
  try {
    row = await db.get('SELECT * FROM agent_genomes WHERE id = ? OR name = ? LIMIT 1', key, key);
  } catch (_) {
    return null;
  }
  if (!row) return null;
  return decodeBuffer(Buffer.from(row.genome_blob));
}

function resolveRef(assignment) {
  if (!assignment) return null;
  if (assignment.genomeRef) return assignment.genomeRef;
  if (assignment.preferredName) return assignment.preferredName;
  return null;
}

async function workerGenesForAssignment(db, assignment) {
  const ref = resolveRef(assignment);
  if (!ref) return null;
  const model = await loadGenome(db, ref);
  if (!model) return null;
  return workerGenes(model);
}

async function importDirectory(db, directory, options) {
  const opts = options || {};
  const files = walkDnaFiles(directory, []);
  const errors = [];
  let imported = 0;
  for (const file of files) {
    try {
      const model = decodeFile(file);
      const id = genomeKey(opts.prefix, model.meta.name);
      await saveGenome(db, model, { id, organizationId: opts.organizationId, projectId: opts.projectId });
      imported += 1;
    } catch (error) {
      errors.push({ file, error: error.message });
    }
  }
  return { files: files.length, imported, failed: errors.length, errors };
}

module.exports = { saveGenome, loadGenome, workerGenesForAssignment, importDirectory, walkDnaFiles };
