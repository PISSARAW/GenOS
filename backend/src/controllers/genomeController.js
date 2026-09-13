const path = require('path');

const { getDatabase } = require('../db');
const store = require('../services/agentDnaStore');

const DEFAULT_DIRECTORY = path.resolve(__dirname, '../../../agents/dna');

function scopeClause(tenant) {
  if (tenant && tenant.organizationId && tenant.projectId) {
    return { clause: 'organization_id = ? AND project_id = ?', params: [tenant.organizationId, tenant.projectId] };
  }
  return { clause: 'organization_id IS NULL', params: [] };
}

function summarize(model) {
  return {
    format: model.format,
    contentHash: model.contentHash,
    name: model.meta.name,
    generation: model.meta.generation,
    ploidy: model.meta.ploidy,
    hayflickLimit: model.meta.hayflickLimit,
    genes: Object.keys(model.genes).length,
    plasmids: model.plasmids.length,
    phenotype: model.phenotype,
    provenance: model.provenance
  };
}

async function listGenomes(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeClause(req.tenant);
    const rows = await db.all(
      `SELECT id, agent_id, name, content_hash, source_manifest, source_doc, created_at, updated_at
         FROM agent_genomes WHERE ${scope.clause} ORDER BY name LIMIT 500`,
      ...scope.params
    );
    res.json({ success: true, count: rows.length, genomes: rows });
  } catch (error) {
    next(error);
  }
}

async function getGenome(req, res, next) {
  try {
    const db = await getDatabase();
    const model = await store.loadGenome(db, req.params.id);
    if (!model) {
      return res.status(404).json({ error: { code: 'GENOME_NOT_FOUND', message: 'AgentDNA genome not found.' } });
    }
    res.json({ success: true, genome: summarize(model) });
  } catch (error) {
    next(error);
  }
}

async function importGenomes(req, res, next) {
  try {
    const db = await getDatabase();
    const requested = req.body && req.body.directory;
    const directory = requested ? String(requested) : DEFAULT_DIRECTORY;
    const tenant = req.tenant || {};
    const stats = await store.importDirectory(db, directory, {
      organizationId: tenant.organizationId,
      projectId: tenant.projectId
    });
    res.json({ success: stats.failed === 0, operation: 'import_agent_dna', directory, ...stats });
  } catch (error) {
    next(error);
  }
}

module.exports = { listGenomes, getGenome, importGenomes, summarize };
