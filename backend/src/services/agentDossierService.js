const strategyContracts = require('./strategyContractService');

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

async function agentFamily(db, agentId) {
  return db.all(
    `WITH RECURSIVE family AS (
       SELECT *, 0 AS depth FROM agents WHERE id = ?
       UNION ALL
       SELECT child.*, family.depth + 1 FROM agents child
       JOIN family ON child.parent_agent_id = family.id
     )
     SELECT * FROM family ORDER BY depth, created_at, id`,
    agentId
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

async function loadAgentDossier(db, agentId) {
  const family = await agentFamily(db, agentId);
  if (!family.length) return null;
  const root = family[0];
  const familyIds = family.map((agent) => agent.id);
  const placeholders = familyIds.map(() => '?').join(',');
  const events = (await db.all(
    `SELECT * FROM telemetry_events WHERE agent_id IN (${placeholders}) ORDER BY created_at, id`,
    ...familyIds
  )).map(mapEvent);
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
  const genome = {
    identity: {
      id: root.id, name: root.name, role: root.role, agentType: root.agent_type,
      executionMode: root.execution_mode, modelTier: root.model_tier, language: root.language
    },
    lineage: { parentAgentId: root.parent_agent_id, relation: root.lineage_relation },
    strategy: currentContract,
    decisions: decisions.map((item) => ({ ...item, cartNodes: parseJson(item.cart_nodes_json, []) }))
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
    forks,
    children,
    descendants,
    executionRuns: runs.map((run) => ({ ...run, budget: parseJson(run.budget_json), metrics: parseJson(run.metrics_json) })),
    events
  };
}

module.exports = { loadAgentDossier, agentFamily, memoryRecords, mutationRecords, runtimeOrganizations };
