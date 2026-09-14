/**
 * AgentDNA innovation loop.
 *
 * When a validated worker succeeds using a capability its base genome did not
 * encode, the orchestrator can distill that acquired concept into a new
 * candidate genome (adaptive radiation / speciation). Promoted candidates then
 * become selectable by the normal worker recruitment path.
 */

const operations = require('./agentDnaOperations');
const store = require('./agentDnaStore');

async function safeGet(db, sql, ...params) {
  try {
    return await db.get(sql, ...params);
  } catch (_) {
    return null;
  }
}

function normalizeTool(tool) {
  let out = '';
  for (const character of String(tool || '')) {
    if (/[a-z0-9]/i.test(character)) out += character.toUpperCase();
    else if ('_- .:/'.includes(character)) out += '_';
  }
  while (out.endsWith('_')) out = out.slice(0, -1);
  return out.slice(0, 50);
}

function detectNovelConcepts(baseModel, tools) {
  const genes = (baseModel && baseModel.genes) || {};
  const concepts = [];
  for (const tool of tools || []) {
    const locus = `TOOL_${normalizeTool(tool)}`;
    if (!genes[locus]) concepts.push({ locus, instruction: String(tool) });
  }
  return concepts;
}

async function scopeForWorkspace(db, workspaceId) {
  if (!workspaceId) return {};
  const row = await safeGet(db, 'SELECT organization_id, project_id FROM workspaces WHERE id = ?', workspaceId);
  if (!row) return {};
  return { organizationId: row.organization_id, projectId: row.project_id };
}

async function latestToolLease(db, agentId) {
  const row = await safeGet(
    db,
    "SELECT payload_json FROM telemetry_events WHERE agent_id = ? AND event_type = 'WORKER_CAPABILITY_LEASED' ORDER BY created_at DESC, rowid DESC LIMIT 1",
    agentId
  );
  if (!row || !row.payload_json) return [];
  try {
    const payload = JSON.parse(row.payload_json);
    return Array.isArray(payload.toolLease) ? payload.toolLease : [];
  } catch (_) {
    return [];
  }
}

function evidenceSummary(event) {
  const payload = (event && event.payload) || {};
  return {
    eventType: event && event.eventType,
    severity: event && event.severity,
    claims: Array.isArray(payload.claims) ? payload.claims.slice(0, 5) : []
  };
}

async function captureCandidate(db, request) {
  const scope = request.scope || {};
  const result = await operations.runOperation(db, {
    operation: 'speciate',
    params: {
      genomeId: request.baseGenomeRef,
      name: request.name,
      concept: request.concept,
      grafts: request.concepts
    },
    scope
  });
  const id = `innovation-${result.contentHash.slice(0, 16)}`;
  await db.run('UPDATE agent_genomes SET status = ?, concept = ? WHERE id = ?', 'candidate', request.concept || null, result.genomeRef);
  await db.run(
    `INSERT INTO agent_genome_innovations (id, source_agent_id, base_genome_ref, candidate_genome_ref, concept, evidence_json, status, organization_id, project_id)
     VALUES (?, ?, ?, ?, ?, ?, 'candidate', ?, ?)
     ON CONFLICT(id) DO UPDATE SET evidence_json = excluded.evidence_json`,
    id,
    request.sourceAgentId || null,
    request.baseGenomeRef,
    result.genomeRef,
    request.concept || null,
    JSON.stringify(request.evidence || {}),
    scope.organizationId || null,
    scope.projectId || null
  );
  return {
    id,
    status: 'candidate',
    baseGenomeRef: request.baseGenomeRef,
    candidateGenomeRef: result.genomeRef,
    concept: request.concept
  };
}

async function captureFromSuccess(ctx) {
  if (!store.dnaEnabled()) return null;
  const { db, mission, event } = ctx;
  const agentId = mission && mission.agentId;
  if (!agentId) return null;
  const agent = await safeGet(db, 'SELECT role, workspace_id FROM agents WHERE id = ?', agentId);
  if (!agent) return null;
  const scope = await scopeForWorkspace(db, agent.workspace_id);
  const missionText = (mission.prompt || mission.currentTask || '');
  const base = await store.selectGenome(db, { role: agent.role, mission: missionText }, scope);
  if (!base) return null;
  const tools = await latestToolLease(db, agentId);
  const concepts = detectNovelConcepts(base.model, tools);
  if (!concepts.length) return null;
  return captureCandidate(db, {
    baseGenomeRef: base.id,
    name: `${base.model.meta.name}-${concepts[0].locus.toLowerCase().slice(0, 24)}`,
    concept: concepts.map((concept) => concept.instruction).join(','),
    concepts,
    sourceAgentId: agentId,
    evidence: evidenceSummary(event),
    scope
  });
}

async function promoteCandidate(db, id) {
  const row = await safeGet(db, 'SELECT candidate_genome_ref FROM agent_genome_innovations WHERE id = ?', id);
  if (!row) {
    throw Object.assign(new Error(`innovation '${id}' not found`), { code: 'INNOVATION_NOT_FOUND' });
  }
  await db.run("UPDATE agent_genome_innovations SET status = 'promoted' WHERE id = ?", id);
  await db.run("UPDATE agent_genomes SET status = 'active' WHERE id = ?", row.candidate_genome_ref);
  return { id, status: 'promoted', candidateGenomeRef: row.candidate_genome_ref };
}

async function listInnovations(db, scope) {
  const ids = scope || {};
  if (ids.organizationId && ids.projectId) {
    return db.all(
      'SELECT * FROM agent_genome_innovations WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 200',
      ids.organizationId,
      ids.projectId
    );
  }
  return db.all('SELECT * FROM agent_genome_innovations ORDER BY created_at DESC LIMIT 200');
}

module.exports = {
  detectNovelConcepts,
  captureCandidate,
  captureFromSuccess,
  promoteCandidate,
  listInnovations,
  latestToolLease,
  normalizeTool
};
