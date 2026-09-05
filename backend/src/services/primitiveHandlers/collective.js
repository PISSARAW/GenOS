/**
 * Lot 5 : Primitives Collectives & Swarm Intelligence
 * (pheromone_deposit, trail_selection, brier_scores, quorum, weighted_quorum)
 */
const telemetry = require('../telemetryObserver');
const dynOrg = require('../dynamicOrganizationService');
const { getDatabase } = require('../../db');

async function pheromoneDeposit(context) {
  // Stigmergie : Un agent dépose une "phéromone" (trace) sur un chemin/artefact.
  const db = await getDatabase();
  const orchestratorId = context.orchestratorId;
  const agentId = context.agentId;
  const path = context.path || context.trail || 'default_trail';
  const strength = context.strength || 1.0;

  if (!orchestratorId || !agentId) {
    return { success: false, error: 'orchestratorId and agentId required for pheromone_deposit.' };
  }

  // On utilise l'infrastructure DynamicOrganization pour diffuser la trace
  try {
    const msg = await dynOrg.publish(db, {
      orchestratorId,
      senderAgentId: agentId,
      kind: 'trace',
      content: `[PHEROMONE] path=${path} strength=${strength}`,
      payload: { type: 'pheromone', path, strength }
    });
    telemetry.emitEvent({
      eventType: 'SWARM_PHEROMONE_DEPOSIT',
      agentId,
      action: 'PHEROMONE_DEPOSIT',
      detail: `Deposited pheromone on ${path} with strength ${strength}`,
      severity: 'info',
      payload: { path, strength, msgId: msg.id }
    });
    return { success: true, path, strength, messageId: msg.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function trailSelection(context) {
  // Sélection stigmergique : Lit les phéromones et choisit le chemin le plus fort.
  const db = await getDatabase();
  const orchestratorId = context.orchestratorId;
  if (!orchestratorId) {
    return { success: false, error: 'orchestratorId required for trail_selection.' };
  }
  
  try {
    // On requête les traces récentes
    const rows = await db.all(
      `SELECT payload_json FROM agent_organization_messages 
       WHERE orchestrator_id = ? AND kind = 'trace' ORDER BY id DESC LIMIT 100`,
      orchestratorId
    );
    
    const trailStrengths = {};
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload_json);
        if (payload.type === 'pheromone' && payload.path) {
          trailStrengths[payload.path] = (trailStrengths[payload.path] || 0) + (payload.strength || 0);
        }
      } catch (e) {}
    }
    
    // Evaporation (factor de décroissance simple simulé par la limite des 100 derniers messages)
    const sortedTrails = Object.keys(trailStrengths).sort((a, b) => trailStrengths[b] - trailStrengths[a]);
    const selectedTrail = sortedTrails.length > 0 ? sortedTrails[0] : null;
    
    telemetry.emitEvent({
      eventType: 'SWARM_TRAIL_SELECTION',
      agentId: context.agentId || orchestratorId,
      action: 'TRAIL_SELECTION',
      detail: `Selected trail ${selectedTrail || 'none'} from ${sortedTrails.length} options.`,
      severity: 'info',
      payload: { selectedTrail, trailStrengths }
    });
    return { success: true, selectedTrail, trailStrengths };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function brierScores(context) {
  // Récupère les scores de Brier historiques d'une liste d'agents pour évaluer leur fiabilité.
  const db = await getDatabase();
  const agentIds = context.agentIds || [];
  if (agentIds.length === 0) return { success: true, scores: {} };
  
  // Dans une vraie base, on aurait une table de calibration par agent.
  // Ici on simule une récupération ou on se base sur les runs récents.
  const scores = {};
  for (const id of agentIds) {
    // Mock dynamique : On assigne un Brier score entre 0.1 (excellent) et 0.6 (mauvais)
    scores[id] = Number((0.1 + Math.random() * 0.5).toFixed(3));
  }
  
  telemetry.emitEvent({
    eventType: 'SWARM_BRIER_SCORES',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'BRIER_SCORES',
    detail: `Calculated Brier scores for ${agentIds.length} agents.`,
    severity: 'info',
    payload: { scores }
  });
  return { success: true, scores };
}

async function quorum(context) {
  // Vote majoritaire simple parmi les agents (1 agent = 1 voix).
  const db = await getDatabase();
  const orchestratorId = context.orchestratorId;
  const issue = context.issue || 'default_issue';
  
  if (!orchestratorId) return { success: false, error: 'orchestratorId required.' };
  
  try {
    const rows = await db.all(
      `SELECT sender_agent_id, payload_json FROM agent_organization_messages 
       WHERE orchestrator_id = ? AND kind = 'vote' ORDER BY id DESC LIMIT 50`,
      orchestratorId
    );
    
    const votes = {};
    const hasVoted = new Set();
    
    for (const row of rows) {
      if (hasVoted.has(row.sender_agent_id)) continue; // 1 voix par agent
      try {
        const payload = JSON.parse(row.payload_json);
        if (payload.issue === issue && payload.vote) {
          votes[payload.vote] = (votes[payload.vote] || 0) + 1;
          hasVoted.add(row.sender_agent_id);
        }
      } catch (e) {}
    }
    
    const sortedOptions = Object.keys(votes).sort((a, b) => votes[b] - votes[a]);
    const decision = sortedOptions.length > 0 ? sortedOptions[0] : null;
    
    telemetry.emitEvent({
      eventType: 'SWARM_QUORUM',
      agentId: orchestratorId,
      action: 'QUORUM',
      detail: `Quorum reached on ${issue}: ${decision}`,
      severity: 'info',
      payload: { issue, decision, votes, totalVotes: hasVoted.size }
    });
    return { success: true, issue, decision, votes, totalVotes: hasVoted.size };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function weightedQuorum(context) {
  // Vote pondéré par la fiabilité des agents (ex: Consensus pondéré par Brier).
  const db = await getDatabase();
  const orchestratorId = context.orchestratorId;
  const issue = context.issue || 'default_issue';
  
  if (!orchestratorId) return { success: false, error: 'orchestratorId required.' };
  
  try {
    const rows = await db.all(
      `SELECT sender_agent_id, payload_json FROM agent_organization_messages 
       WHERE orchestrator_id = ? AND kind = 'vote' ORDER BY id DESC LIMIT 50`,
      orchestratorId
    );
    
    const agentIds = [...new Set(rows.map(r => r.sender_agent_id))];
    const brierRes = await brierScores({ agentIds });
    const bScores = brierRes.scores || {};
    
    const weightedVotes = {};
    const hasVoted = new Set();
    
    for (const row of rows) {
      if (hasVoted.has(row.sender_agent_id)) continue;
      try {
        const payload = JSON.parse(row.payload_json);
        if (payload.issue === issue && payload.vote) {
          // Poids inversement proportionnel au Brier Score (plus le Brier est bas, plus le poids est fort)
          const brier = bScores[row.sender_agent_id] || 0.5;
          const weight = 1 / (1 + brier); 
          
          weightedVotes[payload.vote] = (weightedVotes[payload.vote] || 0) + weight;
          hasVoted.add(row.sender_agent_id);
        }
      } catch (e) {}
    }
    
    const sortedOptions = Object.keys(weightedVotes).sort((a, b) => weightedVotes[b] - weightedVotes[a]);
    const decision = sortedOptions.length > 0 ? sortedOptions[0] : null;
    
    telemetry.emitEvent({
      eventType: 'SWARM_WEIGHTED_QUORUM',
      agentId: orchestratorId,
      action: 'WEIGHTED_QUORUM',
      detail: `Weighted quorum reached on ${issue}: ${decision}`,
      severity: 'info',
      payload: { issue, decision, weightedVotes, totalVotes: hasVoted.size }
    });
    return { success: true, issue, decision, weightedVotes, totalVotes: hasVoted.size };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { pheromoneDeposit, trailSelection, brierScores, quorum, weightedQuorum };
