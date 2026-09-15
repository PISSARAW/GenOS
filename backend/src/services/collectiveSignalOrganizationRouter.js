'use strict';

const MIN_PHEROMONE_GRADIENT = 5;
const MIN_KURAMOTO_ORDER = 0.70;

const LIGAND_ROUTES = Object.freeze({
  QUORUM: 'quorum_with_abstention',
  QUORUM_AUTOINDUCER: 'quorum_with_abstention',
  REPAIR: 'hierarchical_merge',
  REPAIR_MODULE: 'hierarchical_merge',
  STRESS: 'network_silence',
  DANGER: 'network_silence',
  INHIBIT: 'network_silence'
});

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function routeFromLigand(data) {
  const signal = String(data.cascadeSignal || data.receptorTarget || data.ligand || '').trim().toUpperCase();
  const organization = LIGAND_ROUTES[signal];
  return organization ? { organization, reason: `Ligand cascade ${signal} activated.` } : null;
}

function routeFromVoltage(data) {
  const reached = data.consensusReached === true || data.decision === true;
  const order = numberValue(data.kuramotoOrder);
  const threshold = numberValue(data.thresholdMv);
  const total = numberValue(data.totalVoltageMv);
  const voltageReady = threshold === null || total === null || total >= threshold;
  if (!reached || (order !== null && order < MIN_KURAMOTO_ORDER) || !voltageReady) return null;
  return { organization: 'quorum_with_abstention', reason: 'Synchronized electrocyte consensus reached.' };
}

function routeFromPheromone(data) {
  const gradient = numberValue(data.netGradient ?? data.gradient ?? data.intensity);
  if (gradient === null || Math.abs(gradient) < MIN_PHEROMONE_GRADIENT) return null;
  if (gradient < 0) {
    return { organization: 'network_silence', reason: 'Repellent pheromone gradient exceeded safety threshold.' };
  }
  return { organization: 'slime_mould_network', reason: 'Attractive pheromone gradient selected an adaptive mesh.' };
}

function proposedRoute(signalType, signalData) {
  const data = signalData && typeof signalData === 'object' ? signalData : {};
  if (signalType === 'ligand') return routeFromLigand(data);
  if (signalType === 'voltage') return routeFromVoltage(data);
  if (signalType === 'pheromone') return routeFromPheromone(data);
  return null;
}

async function ensureRouteTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS organization_signal_routes (
      signal_id TEXT PRIMARY KEY,
      orchestrator_id TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      from_organization TEXT,
      to_organization TEXT,
      changed INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS organization_signal_routes_orchestrator_idx
      ON organization_signal_routes(orchestrator_id, created_at);
  `);
}

async function routeCollectiveSignal(options) {
  const {
    db, signalId, signalType, signalData, orchestratorId, changedBy = orchestratorId
  } = options || {};
  if (!db || !orchestratorId || !signalId) return { routed: false, reason: 'ROUTING_CONTEXT_MISSING' };
  const proposal = proposedRoute(String(signalType || '').toLowerCase(), signalData);
  if (!proposal) return { routed: false, reason: 'NO_RECONFIGURATION_RULE_MATCHED' };

  const { changeOrganization, getState } = require('./dynamicOrganizationService');
  await ensureRouteTable(db);
  const current = await getState(db, orchestratorId);
  const transition = await changeOrganization(db, {
    orchestratorId,
    organization: proposal.organization,
    reason: proposal.reason,
    changedBy
  });
  await db.run(
    `INSERT OR REPLACE INTO organization_signal_routes
      (signal_id, orchestrator_id, signal_type, from_organization, to_organization, changed, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    signalId, orchestratorId, signalType, current ? current.organization : null,
    transition.organization, transition.changed ? 1 : 0, proposal.reason
  );
  return { routed: true, ...transition, signalId, signalType };
}

module.exports = { routeCollectiveSignal, proposedRoute };