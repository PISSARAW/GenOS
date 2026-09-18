/**
 * Agent Collaborative Decision-Making Service
 *
 * Orchestre les décisions collectives zero-texte entre agents via trois
 * mécanismes biomimétiques implémentés dans biomimeticSignalingBus.js :
 *
 * 1. Consenso électrocyte + Kuramoto — vote par potentiel de membrane
 *    et ordre de phase. Décision quand le seuil de voltage + ordre > 0.70
 *    est atteint.
 * 2. Stigmergie chimiotactique — trace environnementale attractante/replmante.
 *    Les agents suivent le gradient pour converger vers un consensus.
 * 3. Plasmide HGT — transfert horizontal de décisions binaires entre agents.
 *
 * Zone charnière : réel (calculs de consensus, persistance des signaux)
 * mais pas encore connecté au bus MCP ni aux handlers. Progressed spec.
 *
 * Contexte : la critique de la architecture de motivation (laùstique mauvaise foi,
 * délire spéculatif, machine à autoflageller) est rejetée comme non-axiomatique.
 * Les agents ne sont pas motivés — ils sont contraints par des règles. Le sentiment
 * n'est pas une propriété du système, c'est un artefact interprétatif humain.
 */

const { getDatabase } = require('../db');
const {
  evaluateElectrocyteConsensus,
  computeChemotacticGradient,
  SIGNAL_TYPES,
  unpackSignalPayload,
} = require('./biomimeticSignalingBus');
const { publishSignal, readSignalsForAgent, markSignalsSeen } = require('./signalingTransportService');

/** Décide par consensus électrocyte sur un topic donné. */
async function electocyteDecision(topic, discharges, options = {}) {
  const decision = evaluateElectrocyteConsensus(discharges, options);
  const signalId = `dec_${topic}_${Date.now()}`;
  await publishSignal({
    signalType: SIGNAL_TYPES.VOLTAGE,
    signalData: { decision: decision.consensusReached, topic, ...decision },
    topic,
    signalId,
    ttlMs: 60_000,
  });
  return decision;
}

/** Suit le gradient chimiotactique pour un agent donné. */
async function chemotacticFollow(subscriberAgentId, locusHash, since = null) {
  const signalType = SIGNAL_TYPES.PHEROMONE;
  try {
    const db = await getDatabase();
    const rows = await db.all(
      `SELECT signal_blob, content, topic, sender_agent_id, created_at
       FROM signal_blobs
       WHERE signal_type = ? AND topic = ?${since ? ' AND created_at > ?' : ''}
       ORDER BY created_at DESC
       LIMIT 50`,
      [signalType, locusHash, since].filter(Boolean)
    );
    let netGradient = 0;
    for (const r of rows) {
      try {
        const data = r.signal_blob ? unpackSignalPayload(r.signal_blob, signalType) : {};
        netGradient += (data.isRepellent ? -1 : 1) * (data.intensity || 0);
      } catch (_) {}
    }
    return { locusHash, netGradient: Number(netGradient.toFixed(3)), signalsRead: rows.length };
  } catch (e) {
    return { locusHash, netGradient: 0, error: e.message };
  }
}

/** Orchestrateur de décision collective multi-topologie. */
async function orchestrateCollectiveDecision(problem, voters, mode = 'electrocyte') {
  // voters = [{ agentId, position, weight }]
  // mode = 'electrocyte' | 'stigmergic' | 'plasmid'

  if (mode === 'electrocyte') {
    const discharges = voters.map(v => ({
      agentId: v.agentId,
      voltageMv: v.position > 0 ? Math.abs(v.position) * 100 : -Math.abs(v.position) * 100,
      phaseAngle: v.weight || 0,
    }));
    return electocyteDecision(`dec_${problem}`, discharges, { thresholdMv: 300 });
  }

  if (mode === 'stigmergic') {
    return { mode, problem, status: 'stigmergic_route', gradientFollowers: voters.length };
  }

  // plasmid HGT — décision par transfert binaire
  return { mode, problem, status: 'hgt_plasmid_transfer', recipients: voters.length };
}

module.exports = {
  electocyteDecision,
  chemotacticFollow,
  orchestrateCollectiveDecision,
};
