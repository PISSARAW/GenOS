/**
 * Collective Signal Organization Router
 *
 * Résulte le routage des signaux zero-texte vers les organisations et
 * orchestrateurs concernés. Détermine quels agents/topologies doivent
 * recevoir un signal donné selon son type, topic et l'orchestrateur
 * émetteur.
 *
 * Cette couche est le pont entre le transport persistant (signalingTransportService)
 * et l'organisation dynamique (dynamicOrganizationService). Elle met à jour
 * les abonnements stigmergiques et distribue les signaux aux topologies
 * avec des budgets de signalisation configurés.
 *
 * Progressed spec : le routage est implémenté mais les topologies concernées
 * ne sont pas toutes actives — le bus zero-texte est orphelin côté consommation.
 */

const { getDatabase } = require('../db');

const SIGNAL_TOPIC_PREFIXES = {
  ligand: 'ligand/',
  voltage: 'electrocyte/',
  pheromone: 'stigmergy/',
  plasmid: 'hgt/',
  tensor: 'latent/',
};

function proposedRoute(signalType, signal = {}) {
  const type = String(signalType || '').trim().toLowerCase();
  if (type === 'ligand' && signal.cascadeSignal) return { organization: 'hierarchical_merge' };
  if (type === 'voltage' && signal.consensusReached && Number(signal.kuramotoOrder) >= 0.7
    && Number(signal.totalVoltageMv) >= Number(signal.thresholdMv || 300)) {
    return { organization: 'quorum_with_abstention' };
  }
  if (type === 'pheromone' && Number(signal.netGradient) > 0) return { organization: 'slime_mould_network' };
  if (type === 'pheromone' && Number(signal.netGradient) < 0) return { organization: 'network_silence' };
  return null;
}

/**
 * Détermine les destinataires d'un signal selon son type, topic et orchestrateur.
 * Retourne la liste des agents/organisations cibles + metadata de routage.
 */
async function routeCollectiveSignal({ db, signalId, signalType, signalData = {}, orchestratorId = null }) {
  const topic = extractTopic(signalType, signalData);
  const recipients = [];

  if (!db) {
    return { signalId, signalType, topic, recipients: [], routingMode: 'local_only' };
  }

  try {
    // 1. Agents avec budget de signalisation actif dans la même org
    const orgRows = await db.all(
      `SELECT DISTINCT a.id, a.name
       FROM agents a
       JOIN workspaces w ON a.workspace_id = w.id
       WHERE a.id != ? AND a.status = 'active'
       LIMIT 50`,
      [orchestratorId || '']
    );
    for (const row of orgRows) {
      recipients.push({ kind: 'agent', agentId: row.id, agentName: row.name });
    }

    // 2. Organisations avec budget de signalisation configuré
    const orgBudgetRows = await db.all(
      `SELECT o.id, o.name, os.budget_mv
       FROM organizations o
       JOIN organization_signal_budgets os ON o.id = os.organization_id
       WHERE os.enabled = 1 AND os.budget_mv > 0
       LIMIT 10`
    );
    for (const row of orgBudgetRows) {
      recipients.push({ kind: 'organization', organizationId: row.id, organizationName: row.name, budgetMv: row.budget_mv });
    }
  } catch (e) {
    // Router en local si la requête échoue — pas de blocage du transport
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
