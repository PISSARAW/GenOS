const fs = require('fs');
const path = require('path');

const { packBioPolymer, unpackBioPolymer } = require('./bioPolymerPersistenceService');
const { decodeBuffer, decodeFile, workerGenes } = require('./agentDna');
const policy = require('./agentDnaPolicy');

const ROLE_STOPWORDS = new Set([
  'worker', 'agent', 'the', 'and', 'for', 'from', 'with', 'mission', 'task',
  'review', 'verify', 'implement', 'audit', 'specialist', 'branch'
]);

let importAttempted = false;

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

function dnaEnabled() {
  const flag = String(process.env.GENOS_AGENT_DNA || '').toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
}

async function acceptGenome(db, model, scope) {
  if (!(await policy.isSignatureRequired(db, scope))) return true;
  return model.signatureValid === true;
}

async function ensureImported(db) {
  if (importAttempted) return;
  importAttempted = true;
  if (!dnaEnabled()) return;
  try {
    const row = await db.get('SELECT COUNT(*) AS count FROM agent_genomes');
    if (row && Number(row.count) > 0) return;
    const directory = process.env.GENOS_AGENT_DNA_DIR || path.resolve(__dirname, '../../../agents/dna');
    if (fs.existsSync(directory)) await importDirectory(db, directory, {});
  } catch (_) {
    // Best effort: genome auto-import must never block a mission.
  }
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !ROLE_STOPWORDS.has(token));
}

function scoreGenome(phenotype, assignment) {
  if (!phenotype) return 0;
  const assignmentRole = new Set(tokenize(assignment.role));
  let score = tokenize(phenotype.role).filter((token) => assignmentRole.has(token)).length * 3;
  const assignmentCaps = new Set(tokenize((assignment.capabilities || []).join(' ')));
  score += tokenize((phenotype.capabilities || []).join(' ')).filter((token) => assignmentCaps.has(token)).length * 2;
  const mission = new Set(tokenize(assignment.mission || ''));
  const genomeText = tokenize([phenotype.role, (phenotype.capabilities || []).join(' '), phenotype.prompt].join(' '));
  score += genomeText.filter((token) => mission.has(token)).length * 2;
  return score;
}

async function bestMatch(db, assignment) {
  let rows = [];
  try {
    rows = await db.all('SELECT id, phenotype_blob FROM agent_genomes');
  } catch (_) {
    return null;
  }
  let best = null;
  for (const row of rows) {
    const score = scoreGenome(unpackBioPolymer(row.phenotype_blob), assignment);
    if (!best || score > best.score) best = { id: row.id, score };
  }
  if (!best || best.score < 3) return null;
  return best.id;
}

async function selectExplicit(db, assignment, scope) {
  if (assignment.genomeRef) {
    const model = await loadGenome(db, assignment.genomeRef);
    return model && (await acceptGenome(db, model, scope)) ? { id: assignment.genomeRef, model } : null;
  }
  if (assignment.preferredName) {
    const model = await loadGenome(db, assignment.preferredName);
    return model && (await acceptGenome(db, model, scope)) ? { id: assignment.preferredName, model } : null;
  }
  return null;
}

async function selectGenome(db, assignment, scope) {
  if (!assignment) return null;
  const explicit = await selectExplicit(db, assignment, scope);
  if (explicit) return explicit;
  if (!dnaEnabled()) return null;
  await ensureImported(db);
  const id = await bestMatch(db, assignment);
  if (!id) return null;
  const model = await loadGenome(db, id);
  return model && (await acceptGenome(db, model, scope)) ? { id, model } : null;
}

async function workerGenesForAssignment(db, assignment, scope) {
  const selection = await selectGenome(db, assignment, scope);
  if (!selection) return null;
  return { genomeRef: selection.id, genes: workerGenes(selection.model) };
}

module.exports = {
  saveGenome,
  loadGenome,
  selectGenome,
  workerGenesForAssignment,
  importDirectory,
  walkDnaFiles,
  dnaEnabled,
  ensureImported
};
