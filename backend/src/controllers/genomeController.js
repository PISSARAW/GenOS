const path = require('path');

const { getDatabase } = require('../db');
const store = require('../services/agentDnaStore');
const operations = require('../services/agentDnaOperations');
const policy = require('../services/agentDnaPolicy');
const innovation = require('../services/agentDnaInnovation');

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

module.exports = { listGenomes, getGenome, importGenomes, operateGenome, getGenomePolicy, setGenomePolicy, listInnovations, listGenomeSelections, createInnovation, evaluateInnovation, promoteInnovation, rejectInnovation, summarize };

async function listInnovations(req, res, next) {
  try {
    const db = await getDatabase();
    res.json({ success: true, innovations: await innovation.listInnovations(db, tenantScope(req)) });
  } catch (error) {
    next(error);
  }
}

async function listGenomeSelections(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = tenantScope(req);
    let rows;
    if (scope.organizationId && scope.projectId) rows = await db.all(
      'SELECT * FROM agent_genome_selections WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 200',
      scope.organizationId,
      scope.projectId
    );
    else rows = await db.all('SELECT * FROM agent_genome_selections WHERE organization_id IS NULL AND project_id IS NULL ORDER BY created_at DESC LIMIT 200');
    res.json({ success: true, selections: rows });
  } catch (error) {
    next(error);
  }
}

async function createInnovation(req, res, next) {
  try {
    const db = await getDatabase();
    const body = req.body || {};
    const concepts = Array.isArray(body.concepts) ? body.concepts : [];
    if (!body.baseGenomeRef || !body.concept || concepts.length === 0) {
      return res.status(400).json({ error: { code: 'INNOVATION_INPUT_REQUIRED', message: 'baseGenomeRef, concept and concepts are required.' } });
    }
    const created = await innovation.captureCandidate(db, {
      baseGenomeRef: body.baseGenomeRef,
      name: body.name,
      concept: body.concept,
      concepts,
      sourceAgentId: req.user && req.user.id,
      evidence: body.evidence || {},
      scope: tenantScope(req)
    });
    res.status(201).json({ success: true, innovation: created });
  } catch (error) {
    next(error);
  }
}

async function promoteInnovation(req, res, next) {
  try {
    const db = await getDatabase();
    await assertInnovationScope(db, req);
    res.json({ success: true, innovation: await innovation.promoteCandidate(db, req.params.id) });
  } catch (error) {
    next(error);
  }
}

async function evaluateInnovation(req, res, next) {
  try {
    const db = await getDatabase();
    await assertInnovationScope(db, req);
    res.json({ success: true, innovation: await innovation.evaluateCandidate(db, req.params.id) });
  } catch (error) {
    next(error);
  }
}

async function rejectInnovation(req, res, next) {
  try {
    const db = await getDatabase();
    await assertInnovationScope(db, req);
    res.json({ success: true, innovation: await innovation.rejectCandidate(db, req.params.id, req.body && req.body.reason) });
  } catch (error) {
    next(error);
  }
}

async function assertInnovationScope(db, req) {
  const rows = await innovation.listInnovations(db, tenantScope(req));
  if (!rows.some((row) => row.id === req.params.id)) {
    throw Object.assign(new Error('Innovation not found in tenant scope'), { code: 'INNOVATION_NOT_FOUND' });
  }
}

function tenantScope(req) {
  const tenant = req.tenant || {};
  return { organizationId: tenant.organizationId, projectId: tenant.projectId };
}

async function getGenomePolicy(req, res, next) {
  try {
    const db = await getDatabase();
    res.json({ success: true, policy: await policy.getPolicy(db, tenantScope(req)) });
  } catch (error) {
    next(error);
  }
}

async function setGenomePolicy(req, res, next) {
  try {
    const scope = tenantScope(req);
    if (!scope.organizationId || !scope.projectId) {
      return res.status(400).json({
        error: { code: 'GENOME_POLICY_SCOPE_REQUIRED', message: 'X-Organization-Id and X-Project-Id are required.' }
      });
    }
    const db = await getDatabase();
    const body = req.body || {};
    const requireSigned = body.requireSigned === true || body.requireSigned === 'true';
    res.json({ success: true, policy: await policy.setPolicy(db, scope, requireSigned) });
  } catch (error) {
    next(error);
  }
}

async function operateGenome(req, res, next) {
  try {
    const db = await getDatabase();
    // speciate/graft passent par la gate: rôle admin exigé + audit log.
    if (req.params.operation === 'speciate' || req.params.operation === 'graft') {
      const role = req.user && req.user.role;
      if (role !== 'admin') {
        return res.status(403).json({ error: { code: 'GENOME_GATE_FORBIDDEN', message: 'speciate/graft require admin role.' } });
      }
      await db.run(
        'INSERT INTO audit_logs (actor, agent_id, action, resource, decision, reason, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        (req.user && req.user.id) || 'unknown', null, 'GENOME_GATED_OPERATION',
        `genomes/${req.params.id}`, 'allow', req.params.operation,
        JSON.stringify({ operation: req.params.operation, genomeId: req.params.id })
      );
    }
    const params = Object.assign({}, req.body || {}, { genomeId: req.params.id });
    const result = await operations.runOperation(db, {
      operation: req.params.operation,
      params,
      scope: req.tenant || {}
    });
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}
