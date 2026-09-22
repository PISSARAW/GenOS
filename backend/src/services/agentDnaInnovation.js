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

function fossilConcepts(record) {
  const payload = record && record.mineral_payload;
  const source = [
    ...(Array.isArray(record && record.hard_parts) ? record.hard_parts : []),
    ...(payload && typeof payload === 'object' ? ['tools', 'contracts', 'golden_paths', 'provenance'].flatMap((key) => Array.isArray(payload[key]) ? payload[key] : []) : [])
  ];
  const seen = new Set();
  return source.filter((value) => {
    const instruction = String(value || '').trim();
    if (!instruction || seen.has(instruction)) return false;
    seen.add(instruction);
    return true;
  }).map((instruction) => ({ locus: `FOSSIL_${normalizeTool(instruction)}`, instruction }));
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
    source: 'validated_worker_success',
    eventType: event && event.eventType,
    severity: event && event.severity,
    payload: {
      evidenceReport: payload.evidenceReport || null,
      noAnswerProof: payload.noAnswerProof || null,
      failure: payload.failure || null
    }
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
     ON CONFLICT(id) DO UPDATE SET source_agent_id = excluded.source_agent_id, evidence_json = excluded.evidence_json,
       status = 'candidate', evaluation_json = NULL, decision_at = NULL`,
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
  if (!require('./agentEvidenceService').hasDecisionEvidence(event)) return null;
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

  // B4: croiser les outils loués avec les événements d'exécution pour vérifier l'usage effectif
  const contributionEvidence = await findToolUsageEvidence(db, agentId, concepts);

  return captureCandidate(db, {
    baseGenomeRef: base.id,
    name: `${base.model.meta.name}-${concepts[0].locus.toLowerCase().slice(0, 24)}`,
    concept: concepts.map((concept) => concept.instruction).join(','),
    concepts,
    sourceAgentId: agentId,
    evidence: { ...evidenceSummary(event), contributionEvidence },
    scope
  });
}

async function findToolUsageEvidence(db, agentId, concepts) {
  const evidence = {};
  const usageRows = await safeGet(
    db,
    `SELECT COUNT(*) as cnt FROM telemetry_events
     WHERE agent_id = ? AND event_type = 'WORKER_TOOL_USED'
     AND created_at >= (SELECT created_at FROM telemetry_events WHERE agent_id = ? AND event_type = 'WORKER_CAPABILITY_LEASED' ORDER BY created_at DESC LIMIT 1)`,
    agentId, agentId
  );
  for (const concept of concepts) {
    evidence[concept.locus] = {
      observed: Number(usageRows?.cnt || 0) > 0,
      method: usageRows?.cnt > 0 ? 'observed' : 'heuristic'
    };
  }
  return evidence;
}

async function captureFromFossil(ctx) {
  if (!store.dnaEnabled() || !ctx || !ctx.db || !ctx.record) return null;
  if (ctx.integrityVerified === false) return null;
  const concepts = fossilConcepts(ctx.record);
  if (!concepts.length) return null;
  const scope = {
    organizationId: ctx.record.organization_id,
    projectId: ctx.record.project_id
  };
  const baseGenomeRef = ctx.baseGenomeRef || (await store.selectGenome(ctx.db, {
    role: 'fossil-researcher',
    mission: ctx.record.reason,
    genomeRef: ctx.record.base_genome_ref
  }, scope))?.id;
  if (!baseGenomeRef) return { status: 'skipped', reason: 'base_genome_unavailable', fossilId: ctx.record.fossil_id };
  return captureCandidate(ctx.db, {
    baseGenomeRef,
    name: `Fossil-${ctx.record.fossil_id.slice(0, 12)}`,
    concept: concepts.map((concept) => concept.instruction).join(','),
    concepts,
    sourceAgentId: ctx.record.extinct_lineage_id,
    evidence: {
      source: 'stratigraphic_fossil',
      fossilId: ctx.record.fossil_id,
      payloadHash: ctx.record.payload_hash,
      integrityVerified: ctx.integrityVerified !== false
    },
    scope
  });
}

async function promoteCandidate(db, id) {
  const row = await safeGet(db, 'SELECT candidate_genome_ref, status, evaluation_json FROM agent_genome_innovations WHERE id = ?', id);
  if (!row) {
    throw Object.assign(new Error(`innovation '${id}' not found`), { code: 'INNOVATION_NOT_FOUND' });
  }
  if (row.status !== 'candidate') throw Object.assign(new Error('Only candidate innovations can be promoted'), { code: 'INNOVATION_NOT_CANDIDATE' });
  let evaluation = null;
  try { evaluation = JSON.parse(row.evaluation_json || 'null'); } catch (_) { evaluation = null; }
  if (!evaluation || evaluation.eligible !== true) {
    throw Object.assign(new Error('Innovation has not passed evaluation and promotion gates'), { code: 'INNOVATION_GATE_BLOCKED' });
  }
  await db.run("UPDATE agent_genome_innovations SET status = 'promoted', decision_at = CURRENT_TIMESTAMP WHERE id = ?", id);
  await db.run("UPDATE agent_genomes SET status = 'active' WHERE id = ?", row.candidate_genome_ref);
  return { id, status: 'promoted', candidateGenomeRef: row.candidate_genome_ref };
}

async function evaluateCandidate(db, id) {
  const row = await safeGet(db, 'SELECT * FROM agent_genome_innovations WHERE id = ?', id);
  if (!row) throw Object.assign(new Error(`innovation '${id}' not found`), { code: 'INNOVATION_NOT_FOUND' });
  const model = await store.loadGenome(db, row.candidate_genome_ref);

  // B5: charger le parent pour comparaison
  const parent = row.base_genome_ref ? await store.loadGenome(db, row.base_genome_ref) : null;

  const evidence = parseEvidence(row.evidence_json);
  const sourceEvidence = hasTrustedEvidence(evidence);
  const scope = { organizationId: row.organization_id, projectId: row.project_id };
  const signatureRequired = await require('./agentDnaPolicy').isSignatureRequired(db, scope);
  const checks = evaluationChecks({
    model,
    parent,
    evidence: sourceEvidence,
    signature: signatureRequired
  });
  const evaluation = { evaluatedAt: new Date().toISOString(), checks, eligible: Object.values(checks).every(Boolean) };
  await db.run('UPDATE agent_genome_innovations SET evaluation_json = ? WHERE id = ?', JSON.stringify(evaluation), id);
  return { id, status: row.status, evaluation };
}

function parseEvidence(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

function hasTrustedEvidence(evidence) {
  if (evidence.source === 'stratigraphic_fossil') return Boolean(evidence.integrityVerified && evidence.payloadHash);
  return evidence.source === 'validated_worker_success'
    && require('./agentEvidenceService').hasDecisionEvidence(evidence);
}

function evaluationChecks({ model, parent, evidence, signature }) {
  return {
    genomeValid: Boolean(model && model.meta && model.genes && model.provenance),
    sourceEvidence: evidence,
    signaturePolicy: !signature || Boolean(model && model.signatureValid),
    superiorToParent: parent ? isSuperiorToParent(model, parent) : null
  };
}

function isSuperiorToParent(model, parent) {
  if (!parent || !parent.genes) return true;
  const candidateGenes = Object.keys(model.genes || {}).length;
  const parentGenes = Object.keys(parent.genes).length;
  return candidateGenes > parentGenes;
}

async function rejectCandidate(db, id, reason) {
  const row = await safeGet(db, 'SELECT candidate_genome_ref, status FROM agent_genome_innovations WHERE id = ?', id);
  if (!row) throw Object.assign(new Error(`innovation '${id}' not found`), { code: 'INNOVATION_NOT_FOUND' });
  if (row.status !== 'candidate') throw Object.assign(new Error('Only candidate innovations can be rejected'), { code: 'INNOVATION_NOT_CANDIDATE' });
  const decision = { decision: 'rejected', reason: String(reason || 'operator_rejected'), decidedAt: new Date().toISOString() };
  await db.run("UPDATE agent_genome_innovations SET status = 'rejected', evaluation_json = ?, decision_at = CURRENT_TIMESTAMP WHERE id = ?", JSON.stringify(decision), id);
  await db.run("UPDATE agent_genomes SET status = 'rejected' WHERE id = ? AND status = 'candidate'", row.candidate_genome_ref);
  return { id, status: 'rejected', candidateGenomeRef: row.candidate_genome_ref, reason: decision.reason };
}

async function listInnovations(db, scope) {
  const ids = scope || {};
  if (ids.organizationId && ids.projectId) return db.all(
    'SELECT * FROM agent_genome_innovations WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 200',
    ids.organizationId,
    ids.projectId
  );
  return db.all('SELECT * FROM agent_genome_innovations WHERE organization_id IS NULL AND project_id IS NULL ORDER BY created_at DESC LIMIT 200');
}

module.exports = {
  detectNovelConcepts,
  captureCandidate,
  captureFromSuccess,
  captureFromFossil,
  fossilConcepts,
  promoteCandidate,
  evaluateCandidate,
  rejectCandidate,
  listInnovations,
  latestToolLease,
  normalizeTool
};
