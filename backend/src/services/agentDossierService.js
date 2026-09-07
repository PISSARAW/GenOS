const strategyContracts = require('./strategyContractService');
const { getDatabase } = require('../db');
const MAX_AGENT_FAMILY_DEPTH = 32;

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function mapEvent(row) {
  return {
    id: row.id,
    agentId: row.agent_id,
    eventType: row.event_type,
    action: row.action,
    detail: row.detail,
    payload: parseJson(row.payload_json),
    severity: row.severity,
    createdAt: row.created_at
  };
}

function workspaceScope(tenant, alias = 'w') {
  const prefix = alias ? `${alias}.` : '';
  return tenant
    ? { clause: `${prefix}organization_id = ? AND ${prefix}project_id = ?`, params: [tenant.organizationId, tenant.projectId] }
    : { clause: `${prefix}organization_id IS NULL AND ${prefix}project_id IS NULL`, params: [] };
}

async function agentFamily(db, agentId, tenant) {
  const scope = workspaceScope(tenant);
  const childScopeClause = tenant
    ? `(child.workspace_id IS NULL OR (${scope.clause}))`
    : `(${scope.clause})`;
  return db.all(
    `WITH RECURSIVE family AS (
       SELECT a.*, 0 AS depth FROM agents a
       LEFT JOIN workspaces w ON w.id = a.workspace_id
       WHERE a.id = ? AND ${scope.clause}
       UNION ALL
      SELECT child.*, family.depth + 1 FROM agents child
      LEFT JOIN workspaces w ON w.id = child.workspace_id
      JOIN family ON child.parent_agent_id = family.id
      WHERE family.depth < ? AND ${childScopeClause}
     )
     SELECT * FROM family ORDER BY depth, created_at, id`,
    agentId,
    ...scope.params,
    MAX_AGENT_FAMILY_DEPTH,
    ...scope.params
  );
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function runtimeOrganizations(events) {
  const candidates = [];
  for (const event of events) {
    const organization = event.payload?.organization || event.payload?.autonomyPlan?.organization;
    if (organization) candidates.push({ name: organization, source: event.eventType, agentId: event.agentId, firstUsedAt: event.createdAt });
  }
  return uniqueBy(candidates, (item) => item.name);
}

function memoryRecords(events) {
  return events.filter((event) => {
    if (['EVIDENCE_REPORT', 'AGENT_COMPLETED', 'LOCAL_WORKER_COMPLETED'].includes(event.eventType)) return true;
    return /MEMORY|EXPERIENCE|DECISION/.test(event.eventType);
  }).map((event) => ({
    id: `event-${event.id}`,
    agentId: event.agentId,
    kind: event.eventType,
    summary: event.detail,
    content: event.payload,
    createdAt: event.createdAt
  }));
}

function mutationRecords(events) {
  return events.filter((event) => /MUTATION|CROSSOVER|EVOLUTION|PARASIT/.test(event.eventType) || /MUTAT|CROSSOVER|EVOL/.test(event.action));
}

function synthesisInfluenceRecords(events) {
  const records = [];
  const verifiedWorkers = new Set();
  for (const event of events) {
    if (event.eventType === 'DOSSIER_INFLUENCE_VERIFIED') {
      for (const wid of event.payload?.workerIds || []) verifiedWorkers.add(wid);
    }
    const report = event.payload?.evidenceReport || event.payload?.report || (event.payload?.dossierInfluence ? event.payload : null);
    if (Array.isArray(report?.dossierInfluence)) {
      for (const entry of report.dossierInfluence) {
        if (!entry || typeof entry !== 'object') continue;
        records.push({
          sourceAgentId: event.agentId,
          workerId: entry.workerId,
          influence: entry.influence,
          usedClaims: Array.isArray(entry.usedClaims) ? entry.usedClaims : [],
          recordedAt: event.createdAt
        });
      }
    }
  }
  return {
    verifiedWorkerIds: [...verifiedWorkers],
    influences: records
  };
}

async function loadAgentDossier(db, agentId, tenant) {
  if (typeof db === 'string') {
    tenant = agentId;
    agentId = db;
    db = await getDatabase();
  }
  const family = await agentFamily(db, agentId, tenant);
  if (!family.length) return null;
  const root = family[0];
  const familyIds = family.map((agent) => agent.id);
  const placeholders = familyIds.map(() => '?').join(',');
  const events = (await db.all(
    `SELECT * FROM telemetry_events WHERE agent_id IN (${placeholders}) ORDER BY created_at DESC, id DESC LIMIT 10000`,
    ...familyIds
  )).reverse().map(mapEvent);
  const contracts = await strategyContracts.listContracts(db, agentId);
  const contractOwnerId = root.execution_mode === 'worker' ? root.parent_agent_id : agentId;
  const currentContract = contractOwnerId ? await strategyContracts.getLatestContract(db, contractOwnerId) : null;
  const decisions = await db.all(
    `SELECT * FROM genome_decisions WHERE created_by IN (${placeholders}) ORDER BY created_at, id`,
    ...familyIds
  );
  const runs = await db.all(
    `SELECT * FROM strategy_execution_runs WHERE agent_id IN (${placeholders}) ORDER BY created_at, id`,
    ...familyIds
  );
  const tenantOrganization = root.workspace_id
    ? await db.get(`SELECT o.id, o.name FROM workspaces w LEFT JOIN organizations o ON o.id = w.organization_id WHERE w.id = ?`, root.workspace_id)
    : null;
  const children = family.filter((agent) => agent.parent_agent_id === agentId);
  const descendants = family.slice(1);
  const forks = descendants.filter((agent) => agent.lineage_relation !== 'independent');
  const parentEdges = await db.all('SELECT source_node_id, edge_type FROM lineage_edges WHERE target_node_id = ?', agentId).catch(() => []);
  const parentAgentIds = parentEdges.length > 0
    ? parentEdges.map((e) => e.source_node_id)
    : (root.parent_agent_id ? [root.parent_agent_id] : []);
  const genome = {
    identity: {
      id: root.id, name: root.name, nameMeaning: root.name_meaning, role: root.role, agentType: root.agent_type,
      executionMode: root.execution_mode, modelTier: root.model_tier, language: root.language,
      conscience: {
        dissonanceLevel: root.dissonance_level || 0,
        eurekaCount: root.eureka_count || 0,
        cognitiveBudget: root.cognitive_budget || 100,
        cognitiveBaselineBudget: root.cognitive_baseline_budget || 100,
        conscienceRevision: root.conscience_revision || 0,
        isApoptotic: Boolean(root.is_apoptotic)
      }
    },
    lineage: {
      parentAgentId: root.parent_agent_id,
      parentAgentIds,
      biparental: parentAgentIds.length > 1,
      relation: root.lineage_relation
    },
    strategy: currentContract,
    decisions: decisions.map((item) => ({ ...item, cartNodes: parseJson(item.cart_nodes_json, []) })),
    runtimeCapsules: events.filter((event) => event.eventType === 'AGENT_CAPSULE_CREATED').map((event) => event.payload)
  };
  return {
    schema: 'genos.agent-dossier/v1',
    generatedAt: new Date().toISOString(),
    agent: root,
    memory: memoryRecords(events),
    genome,
    contract: currentContract,
    contractHistory: contracts,
    organizations: {
      tenant: tenantOrganization?.id ? tenantOrganization : null,
      runtime: runtimeOrganizations(events)
    },
    mutations: mutationRecords(events),
    synthesisInfluence: synthesisInfluenceRecords(events),
    forks,
    children,
    descendants,
    executionRuns: runs.map((run) => ({ ...run, budget: parseJson(run.budget_json), metrics: parseJson(run.metrics_json) })),
    events
  };
}

module.exports = { MAX_AGENT_FAMILY_DEPTH, loadAgentDossier, agentFamily, memoryRecords, mutationRecords, runtimeOrganizations, synthesisInfluenceRecords };
