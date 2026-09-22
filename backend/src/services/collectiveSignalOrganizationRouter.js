/**
 * Collective Signal Organization Router
 */

const { getDatabase } = require('../db');
const plasticity = require('./synapticPlasticityService');

const SIGNAL_TOPIC_PREFIXES = {
  ligand: 'ligand/',
  voltage: 'electrocyte/',
  pheromone: 'stigmergy/',
  plasmid: 'hgt/',
  tensor: 'latent/',
};

const ROUTE_MAP = {
  ligand: (signal) => signal.cascadeSignal ? 'hierarchical_merge' : null,
  voltage: (signal) => (signal.consensusReached && Number(signal.kuramotoOrder) >= 0.7 && Number(signal.totalVoltageMv) >= Number(signal.thresholdMv || 300)) ? 'quorum_with_abstention' : null,
  pheromone: (signal) => Number(signal.netGradient) > 0 ? 'slime_mould_network' : Number(signal.netGradient) < 0 ? 'network_silence' : null,
};

function proposedRoute(signalType, signal = {}) {
  const type = String(signalType || '').trim().toLowerCase();
  const routeFn = ROUTE_MAP[type];
  if (!routeFn) return null;
  const organization = routeFn(signal);
  return organization ? { organization } : null;
}

function buildScopeConditions(scope) {
  const conditions = [];
  const params = [];
  if (scope.orgId) {
    conditions.push('w.organization_id = ?');
    params.push(scope.orgId);
  }
  if (scope.projId) {
    conditions.push('w.project_id = ?');
    params.push(scope.projId);
  }
  return { conditions, params };
}

async function fetchAgentRecipients(db, orchestratorId, scope) {
  if (!scope.orgId && !scope.projId) return [];
  const { conditions, params: scopeParams } = buildScopeConditions(scope);
  const conditionsWithParent = [
    ...conditions,
    'a.parent_agent_id = ?',
    "a.execution_mode = 'worker'",
    "a.status NOT IN ('completed','terminated','apoptosis','error','failed','unverified','quarantined')",
  ];
  const parentParam = orchestratorId || '';
  return db.all(
    `SELECT DISTINCT a.id, a.name
     FROM agents a JOIN workspaces w ON a.workspace_id = w.id
     WHERE a.id != ? AND ${conditionsWithParent.join(' AND ')} LIMIT ?`,
    [parentParam, ...scopeParams, parentParam, 50]
  );
}

async function fetchOrgBudgetRecipients(db, orgId) {
  const conditions = ['os.enabled = 1', 'os.budget_mv > 0'];
  const params = [];
  if (orgId) {
    conditions.push('o.id = ?');
    params.push(orgId);
  }
  return db.all(
    `SELECT o.id, o.name, os.budget_mv
     FROM organizations o JOIN organization_signal_budgets os ON o.id = os.organization_id
     WHERE ${conditions.join(' AND ')} LIMIT 10`,
    params
  );
}

/**
 * Détermine les destinataires d'un signal.
 * Scope strict : même organisation ET même projet que l'orchestrateur.
 */
async function routeCollectiveSignal({ db, signalId, signalType, signalData = {}, orchestratorId = null }) {
  const topic = extractTopic(signalType, signalData);
  const recipients = [];

  if (!db) {
    return { signalId, signalType, topic, recipients: [], routingMode: 'local_only' };
  }

  try {
    const ws = await db.get(
      `SELECT w.organization_id as organizationId, w.project_id as projectId
       FROM agents a JOIN workspaces w ON a.workspace_id = w.id
       WHERE a.id = ? AND a.execution_mode = 'orchestrator'`,
      orchestratorId
    );
    const scope = { orgId: ws?.organizationId, projId: ws?.projectId };

    for (const row of await fetchAgentRecipients(db, orchestratorId, scope)) {
      const channelWeight = plasticity.getChannelWeight(orchestratorId, row.id);
      recipients.push({ kind: 'agent', agentId: row.id, agentName: row.name, weight: channelWeight.weight });
    }
    // Sort by plasticity weight descending (most reinforced channels first)
    recipients.sort((a, b) => (b.weight || 0) - (a.weight || 0));
    for (const row of await fetchOrgBudgetRecipients(db, scope.orgId)) {
      recipients.push({ kind: 'organization', organizationId: row.id, organizationName: row.name, budgetMv: row.budget_mv });
    }
  } catch (e) {
    console.warn('[SignalRouter] routeCollectiveSignal query failed, local-only routing:', e.message);
  }

  return {
    signalId,
    signalType,
    topic,
    recipients,
    routed: recipients.length > 0,
    routingMode: recipients.length ? 'distributed' : 'local_only',
  };
}

/** Extrait le topic à partir du type de signal et des données. */
function extractTopic(signalType, signalData = {}) {
  const prefix = SIGNAL_TOPIC_PREFIXES[signalType] || 'signal/';
  const data = signalData && typeof signalData === 'object' ? signalData : {};
  const specific = data.topic || data.locus || data.key || 'default';
  return `${prefix}${specific}`;
}

module.exports = {
  routeCollectiveSignal,
  proposedRoute,
  extractTopic,
  SIGNAL_TOPIC_PREFIXES,
};
