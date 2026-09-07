/**
 * Lot 5 : Primitives Collectives & Swarm Intelligence
 * (pheromone_deposit, trail_selection, brier_scores, quorum, weighted_quorum)
 */
const telemetry = require('../telemetryObserver');
const dynOrg = require('../dynamicOrganizationService');
const { getDatabase } = require('../../db');

function parseSqliteUtcTimestamp(ts) {
  if (!ts) return Date.now();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  const str = String(ts).trim();
  if (!str) return Date.now();
  if (str.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(str)) {
    return new Date(str).getTime();
  }
  const isoUtc = str.replace(' ', 'T') + 'Z';
  const parsed = new Date(isoUtc).getTime();
  return Number.isNaN(parsed) ? new Date(str).getTime() : parsed;
}

async function pheromoneDeposit(context) {
  // Stigmergie : Un agent dépose une "phéromone" (trace) sur un chemin/artefact.
  const db = await getDatabase();
  const orchestratorId = context.orchestratorId || context.orchestrator_id || context.orchestrator;
  const agentId = context.agentId || context.agent_id || context.senderId || context.sender_agent_id;
  const path = context.path || context.trail || context.target_file || context.targetFile || 'default_trail';
  const rawStrength = context.strength === undefined ? 1 : Number(context.strength);
  const isRepellent = Boolean(context.isRepellent || context.is_repellent || context.repellent || rawStrength < 0);

  if (!orchestratorId || !agentId) {
    return { success: false, error: 'orchestratorId and agentId required for pheromone_deposit.' };
  }
  if (!Number.isFinite(rawStrength) || rawStrength < -1 || rawStrength > 1) {
    return { success: false, error: 'pheromone strength must be a finite value in [-1, 1].' };
  }

  const finalStrength = isRepellent ? -Math.abs(rawStrength === 0 ? 1 : rawStrength) : Math.abs(rawStrength);

  // On utilise l'infrastructure DynamicOrganization pour diffuser la trace
  try {
    const msg = await dynOrg.publish(db, {
      orchestratorId,
      senderAgentId: agentId,
      kind: 'trace',
      content: `[PHEROMONE] path=${path} strength=${finalStrength}${finalStrength < 0 ? ' (REPELLENT)' : ''}`,
      payload: { type: 'pheromone', path, strength: finalStrength, isRepellent: finalStrength < 0 }
    });
    telemetry.emitEvent({
      eventType: 'SWARM_PHEROMONE_DEPOSIT',
      agentId,
      action: finalStrength < 0 ? 'REPELLENT_PHEROMONE_DEPOSIT' : 'PHEROMONE_DEPOSIT',
      detail: `Deposited ${finalStrength < 0 ? 'repellent ' : ''}pheromone on ${path} with strength ${finalStrength}`,
      severity: 'info',
      payload: { path, strength: finalStrength, isRepellent: finalStrength < 0, msgId: msg.id }
    });
    return { success: true, path, strength: finalStrength, isRepellent: finalStrength < 0, messageId: msg.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function trailSelection(context) {
  // Sélection stigmergique : Lit les phéromones et choisit le chemin le plus fort.
  const db = await getDatabase();
  const orchestratorId = context.orchestratorId || context.orchestrator_id || context.agentId || context.agent_id;
  if (!orchestratorId) {
    return { success: false, error: 'orchestratorId required for trail_selection.' };
  }
  
  try {
    const state = await dynOrg.getState(db, orchestratorId);
    if (!state) return { success: false, error: `Orchestrator '${orchestratorId}' has no active organization.` };
    const evaporationHalfLifeMs = Number(context.evaporationHalfLifeMs || context.evaporation_half_life_ms || context.halfLifeMs || 3600000);
    if (!Number.isFinite(evaporationHalfLifeMs) || evaporationHalfLifeMs <= 0) {
      return { success: false, error: 'evaporationHalfLifeMs must be positive.' };
    }
    const rawRef = context.referenceTime ?? context.reference_time;
    const suppliedReferenceTime = rawRef == null ? Date.now() : parseSqliteUtcTimestamp(rawRef);
    const referenceTime = Number.isFinite(suppliedReferenceTime) ? suppliedReferenceTime : Date.now();
    const rawLimit = context.traceLimit ?? context.trace_limit;
    const traceLimit = rawLimit == null ? 1000 : Number(rawLimit);
    if (!Number.isInteger(traceLimit) || traceLimit < 1 || traceLimit > 10000) {
      return { success: false, error: 'traceLimit must be an integer between 1 and 10000.' };
    }
    const rows = await db.all(
      `SELECT payload_json, created_at FROM agent_organization_messages 
        WHERE orchestrator_id = ? AND organization_version = ? AND kind = 'trace' ORDER BY id DESC LIMIT ?`,
            orchestratorId, state.version, traceLimit
    );
    const totalTraceCount = await db.get(`SELECT COUNT(*) AS count FROM agent_organization_messages
      WHERE orchestrator_id = ? AND organization_version = ? AND kind = 'trace'`, orchestratorId, state.version);
    
    const trailStrengths = {};
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload_json);
        if (payload.type === 'pheromone' && payload.path) {
          const createdAtMs = parseSqliteUtcTimestamp(row.created_at);
          const ageMs = Math.max(0, referenceTime - createdAtMs);
          const evaporation = Math.pow(0.5, ageMs / evaporationHalfLifeMs);
          trailStrengths[payload.path] = (trailStrengths[payload.path] || 0) + ((payload.strength || 0) * evaporation);
        }
      } catch (e) {}
    }
    
    const sortedTrails = Object.keys(trailStrengths).sort((a, b) => trailStrengths[b] - trailStrengths[a] || a.localeCompare(b));
    const repellentTrails = sortedTrails.filter(t => trailStrengths[t] < 0);
    const excludeRepellent = Boolean(context.excludeRepellent || context.exclude_repellent);
    let candidateTrails = sortedTrails;
    if (excludeRepellent) {
      const nonRepellent = sortedTrails.filter(t => trailStrengths[t] > 0);
      if (nonRepellent.length > 0) {
        candidateTrails = nonRepellent;
      }
    }

    const mode = String(context.mode || context.selection_mode || 'greedy').toLowerCase();
    let selectedTrail = null;
    const trailProbabilities = {};

    if (candidateTrails.length > 0) {
      if (mode === 'softmax') {
        const temperature = Math.max(0.001, Number(context.temperature ?? 1.0));
        const maxScore = Math.max(...candidateTrails.map(t => trailStrengths[t]));
        let sumExp = 0;
        const exps = {};
        for (const t of candidateTrails) {
          const expVal = Math.exp((trailStrengths[t] - maxScore) / temperature);
          exps[t] = expVal;
          sumExp += expVal;
        }
        for (const t of candidateTrails) {
          trailProbabilities[t] = sumExp > 0 ? (exps[t] / sumExp) : (1 / candidateTrails.length);
        }
      } else if (mode === 'probabilistic' || mode === 'roulette' || mode === 'fitness') {
        const alpha = Math.max(0.1, Number(context.alpha ?? 1.0));
        let sumWeights = 0;
        const weights = {};
        for (const t of candidateTrails) {
          const w = Math.pow(Math.max(0, trailStrengths[t]), alpha);
          weights[t] = w;
          sumWeights += w;
        }
        for (const t of candidateTrails) {
          trailProbabilities[t] = sumWeights > 0 ? (weights[t] / sumWeights) : (1 / candidateTrails.length);
        }
      } else if (mode === 'epsilon_greedy') {
        const rawEpsilon = Number(context.epsilon ?? 0.1);
        const epsilon = Math.min(1, Math.max(0, Number.isFinite(rawEpsilon) ? rawEpsilon : 0.1));
        const bestTrail = candidateTrails[0];
        const n = candidateTrails.length;
        for (const t of candidateTrails) {
          trailProbabilities[t] = (t === bestTrail ? (1 - epsilon) : 0) + (epsilon / n);
        }
      } else {
        // default: 'greedy'
        for (const t of candidateTrails) {
          trailProbabilities[t] = t === candidateTrails[0] ? 1.0 : 0.0;
        }
      }

      if (mode === 'greedy') {
        selectedTrail = candidateTrails[0];
      } else {
        const r = Math.random();
        let cumulative = 0;
        for (const t of candidateTrails) {
          cumulative += trailProbabilities[t];
          if (r <= cumulative) {
            selectedTrail = t;
            break;
          }
        }
        if (!selectedTrail) {
          selectedTrail = candidateTrails[0];
        }
      }
    }
    
    telemetry.emitEvent({
      eventType: 'SWARM_TRAIL_SELECTION',
      agentId: context.agentId || orchestratorId,
      action: 'TRAIL_SELECTION',
      detail: `Selected trail ${selectedTrail || 'none'} from ${candidateTrails.length} candidates (mode: ${mode}).`,
      severity: 'info',
      payload: { selectedTrail, trailStrengths, trailProbabilities, repellentTrails, mode, referenceTime: new Date(referenceTime).toISOString(), traceLimit, truncated: Number(totalTraceCount?.count || 0) > rows.length }
    });
    return {
      success: true,
      selectedTrail,
      trailStrengths,
      trailProbabilities,
      repellentTrails,
      mode,
      traceLimit,
      truncated: Number(totalTraceCount?.count || 0) > rows.length
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function evaporation(context) {
  // Évaporation active & purge stigmergique des traces obsolètes (< pruneThreshold)
  const db = await getDatabase();
  const orchestratorId = context.orchestratorId || context.orchestrator_id || context.agentId || context.agent_id;
  if (!orchestratorId) {
    return { success: false, error: 'orchestratorId required for evaporation.' };
  }

  try {
    const evaporationHalfLifeMs = Number(context.evaporationHalfLifeMs || context.evaporation_half_life_ms || context.halfLifeMs || 3600000);
    if (!Number.isFinite(evaporationHalfLifeMs) || evaporationHalfLifeMs <= 0) {
      return { success: false, error: 'evaporationHalfLifeMs must be positive.' };
    }
    const rawThreshold = context.pruneThreshold ?? context.prune_threshold ?? context.threshold;
    const pruneThreshold = Math.max(0, Number(rawThreshold ?? 0.001));
    const rawRef = context.referenceTime ?? context.reference_time;
    const suppliedReferenceTime = rawRef == null ? Date.now() : parseSqliteUtcTimestamp(rawRef);
    const referenceTime = Number.isFinite(suppliedReferenceTime) ? suppliedReferenceTime : Date.now();
    const dryRun = Boolean(context.dryRun || context.dry_run);

    const rows = await db.all(
      `SELECT id, payload_json, created_at FROM agent_organization_messages 
       WHERE orchestrator_id = ? AND kind = 'trace' ORDER BY id ASC`,
      orchestratorId
    );

    const expiredIds = [];
    const remainingStrengths = {};

    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload_json);
        if (payload.type === 'pheromone' && payload.path) {
          const createdAtMs = parseSqliteUtcTimestamp(row.created_at);
          const ageMs = Math.max(0, referenceTime - createdAtMs);
          const factor = Math.pow(0.5, ageMs / evaporationHalfLifeMs);
          const rawStrength = Number(payload.strength || 0);
          const effectiveStrength = rawStrength * factor;
          
          if (Math.abs(effectiveStrength) < pruneThreshold) {
            expiredIds.push(row.id);
          } else {
            remainingStrengths[payload.path] = (remainingStrengths[payload.path] || 0) + effectiveStrength;
          }
        }
      } catch (e) {}
    }

    if (!dryRun && expiredIds.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < expiredIds.length; i += batchSize) {
        const batch = expiredIds.slice(i, i + batchSize);
        const placeholders = batch.map(() => '?').join(',');
        await db.run(
          `DELETE FROM agent_organization_messages WHERE id IN (${placeholders})`,
          batch
        );
      }
    }

    telemetry.emitEvent({
      eventType: 'SWARM_EVAPORATION_CYCLE',
      agentId: context.agentId || orchestratorId,
      action: 'EVAPORATION_CYCLE',
      detail: `Evaporated traces for ${orchestratorId}: purged ${expiredIds.length} expired, retained ${Object.keys(remainingStrengths).length} active paths.`,
      severity: 'info',
      payload: {
        orchestratorId,
        purgedTracesCount: expiredIds.length,
        activeTrailsCount: Object.keys(remainingStrengths).length,
        pruneThreshold,
        evaporationHalfLifeMs,
        dryRun
      }
    });

    return {
      success: true,
      orchestratorId,
      purgedTracesCount: expiredIds.length,
      activeTrailsCount: Object.keys(remainingStrengths).length,
      remainingStrengths,
      dryRun
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function brierScores(context) {
  // Récupère les scores de Brier historiques d'une liste d'agents pour évaluer leur fiabilité.
  const agentIds = context.agentIds || [];
  if (agentIds.length === 0) return { success: true, scores: {} };
  const observations = context.calibrationObservations || [];
  const suppliedScores = context.calibrationScores || {};
  const scores = {};
  const db = await getDatabase();

  for (const id of agentIds) {
    const agentObservations = observations.filter((item) => item.agentId === id);
    let score = agentObservations.length > 0
      ? agentObservations.reduce((sum, item) => {
        const prediction = Number(item.prediction);
        const outcome = Number(item.outcome);
        if (!Number.isFinite(prediction) || prediction < 0 || prediction > 1 || !Number.isFinite(outcome) || (outcome !== 0 && outcome !== 1)) {
          return NaN;
        }
        return sum + (prediction - outcome) ** 2;
      }, 0) / agentObservations.length
      : Number(suppliedScores[id]);

    if (!Number.isFinite(score) || score < 0 || score > 1) {
      // Tenter de récupérer l'historique de calibration depuis la table evaluation_runs
      if (db) {
        try {
          const runRow = await db.get(
            'SELECT AVG(brier_score) as avg_brier FROM evaluation_runs WHERE agent_id = ? AND brier_score IS NOT NULL',
            id
          );
          if (runRow && Number.isFinite(runRow.avg_brier) && runRow.avg_brier >= 0 && runRow.avg_brier <= 1) {
            score = Number(runRow.avg_brier);
          }
        } catch (_) {}
      }
    }

    if (!Number.isFinite(score) || score < 0 || score > 1) {
      if (context.allowDefaults || context.fallbackDefault) {
        score = Number(context.defaultScore ?? 0.25);
      } else {
        return { success: false, error: 'Calibration observations or scores required for every agent.' };
      }
    }
    scores[id] = Number(score.toFixed(6));
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
       WHERE orchestrator_id = ? AND kind = 'vote'
         AND (json_extract(payload_json, '$.issue') = ? OR (json_extract(payload_json, '$.issue') IS NULL AND ? = 'default_issue'))
       ORDER BY id DESC LIMIT 500`,
      orchestratorId, issue, issue
    );
    
    const votes = {};
    const hasVoted = new Set();
    
    for (const row of rows) {
      if (hasVoted.has(row.sender_agent_id)) continue; // 1 voix par agent
      try {
        const payload = JSON.parse(row.payload_json);
        if (payload.issue === issue && payload.vote) {
          if (payload.vote !== 'abstain') {
            votes[payload.vote] = (votes[payload.vote] || 0) + 1;
          }
          hasVoted.add(row.sender_agent_id);
        }
      } catch (e) {}
    }
    
    const minParticipation = context.minVotes !== undefined ? context.minVotes : (context.minParticipation !== undefined ? context.minParticipation : 1);
    const threshold = Number.isFinite(context.threshold) ? context.threshold : (Number.isFinite(context.quorumThreshold) ? context.quorumThreshold : 0.5);

    const totalExpressed = Object.values(votes).reduce((sum, val) => sum + val, 0);
    const sortedOptions = Object.keys(votes).sort((a, b) => {
      const diff = votes[b] - votes[a];
      if (diff !== 0) return diff;
      return a.localeCompare(b); // Tie-breaker déterministe
    });
    const topOption = sortedOptions.length > 0 ? sortedOptions[0] : null;
    const topVotes = topOption ? (votes[topOption] || 0) : 0;
    const approvalRate = totalExpressed > 0 ? topVotes / totalExpressed : 0;

    const quorumReached = hasVoted.size >= minParticipation && totalExpressed > 0 && approvalRate >= threshold;
    const decision = quorumReached ? topOption : null;

    telemetry.emitEvent({
      eventType: 'SWARM_QUORUM',
      agentId: orchestratorId,
      action: 'QUORUM',
      detail: quorumReached ? `Quorum reached on ${issue}: ${decision}` : `Quorum not reached on ${issue}`,
      severity: 'info',
      payload: { issue, decision, quorumReached, votes, totalVotes: hasVoted.size, expressedVotes: totalExpressed, approvalRate }
    });

    if (db) {
      try {
        await db.run(
          `INSERT INTO agent_organization_messages (orchestrator_id, organization, organization_version, sender_agent_id, recipient_agent_id, channel, kind, content, payload_json)
           VALUES (?, 'collective', 1, ?, 'broadcast', 'consensus', 'consensus_resolution', ?, ?)`,
          orchestratorId,
          orchestratorId,
          quorumReached ? `Quorum reached on ${issue}: ${decision}` : `Quorum not reached on ${issue}`,
          JSON.stringify({ issue, decision, quorumReached, votes, totalVotes: hasVoted.size, expressedVotes: totalExpressed, approvalRate })
        );
      } catch (_) {}
    }

    return {
      success: true,
      issue,
      decision,
      quorumReached,
      votes,
      totalVotes: hasVoted.size,
      expressedVotes: totalExpressed,
      approvalRate,
      ...(quorumReached ? {} : { error: 'Quorum not reached' })
    };
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
       WHERE orchestrator_id = ? AND kind = 'vote'
         AND (json_extract(payload_json, '$.issue') = ? OR (json_extract(payload_json, '$.issue') IS NULL AND ? = 'default_issue'))
       ORDER BY id DESC LIMIT 500`,
      orchestratorId, issue, issue
    );
    
    const agentIds = [...new Set(rows.map(r => r.sender_agent_id))];
    const brierRes = await brierScores({
      agentIds,
      calibrationScores: context.calibrationScores,
      calibrationObservations: context.calibrationObservations,
      allowDefaults: true,
      defaultScore: 0.25
    });
    if (!brierRes.success) return brierRes;
    const bScores = brierRes.scores || {};
    
    const weightedVotes = {};
    const hasVoted = new Set();
    
    for (const row of rows) {
      if (hasVoted.has(row.sender_agent_id)) continue;
      try {
        const payload = JSON.parse(row.payload_json);
        if (payload.issue === issue && payload.vote) {
          if (payload.vote !== 'abstain') {
            const brier = bScores[row.sender_agent_id] !== undefined ? bScores[row.sender_agent_id] : 0.25;
            // Pénalisation sélective des scores élevés de Brier : B >= 0.5 a un poids drastiquement réduit
            const weight = brier >= 0.5 ? Math.max(0, 0.1 * (1 - brier)) : Math.pow(1 - brier, 2);
            weightedVotes[payload.vote] = (weightedVotes[payload.vote] || 0) + weight;
          }
          hasVoted.add(row.sender_agent_id);
        }
      } catch (e) {}
    }
    
    const minParticipation = context.minVotes !== undefined ? context.minVotes : (context.minParticipation !== undefined ? context.minParticipation : 1);
    const threshold = Number.isFinite(context.threshold) ? context.threshold : (Number.isFinite(context.quorumThreshold) ? context.quorumThreshold : 0.5);

    const totalExpressedWeight = Object.values(weightedVotes).reduce((sum, w) => sum + w, 0);
    const sortedOptions = Object.keys(weightedVotes).sort((a, b) => {
      const diff = weightedVotes[b] - weightedVotes[a];
      if (Math.abs(diff) > 1e-9) return diff;
      return a.localeCompare(b); // Tie-breaker déterministe
    });
    const topOption = sortedOptions.length > 0 ? sortedOptions[0] : null;
    const topWeight = topOption ? (weightedVotes[topOption] || 0) : 0;
    const approvalRate = totalExpressedWeight > 0 ? topWeight / totalExpressedWeight : 0;

    const quorumReached = hasVoted.size >= minParticipation && totalExpressedWeight > 0 && approvalRate >= threshold;
    const decision = quorumReached ? topOption : null;
    
    telemetry.emitEvent({
      eventType: 'SWARM_WEIGHTED_QUORUM',
      agentId: orchestratorId,
      action: 'WEIGHTED_QUORUM',
      detail: quorumReached ? `Weighted quorum reached on ${issue}: ${decision}` : `Weighted quorum not reached on ${issue}`,
      severity: 'info',
      payload: { issue, decision, quorumReached, weightedVotes, totalVotes: hasVoted.size, totalWeight: totalExpressedWeight, approvalRate }
    });

    if (db) {
      try {
        await db.run(
          `INSERT INTO agent_organization_messages (orchestrator_id, organization, organization_version, sender_agent_id, recipient_agent_id, channel, kind, content, payload_json)
           VALUES (?, 'collective', 1, ?, 'broadcast', 'consensus', 'consensus_resolution', ?, ?)`,
          orchestratorId,
          orchestratorId,
          quorumReached ? `Weighted quorum reached on ${issue}: ${decision}` : `Weighted quorum not reached on ${issue}`,
          JSON.stringify({ issue, decision, quorumReached, weightedVotes, totalVotes: hasVoted.size, totalWeight: totalExpressedWeight, approvalRate })
        );
      } catch (_) {}
    }

    return {
      success: true,
      issue,
      decision,
      quorumReached,
      weightedVotes,
      totalVotes: hasVoted.size,
      totalWeight: totalExpressedWeight,
      approvalRate,
      ...(quorumReached ? {} : { error: 'Quorum not reached' })
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { pheromoneDeposit, trailSelection, evaporation, brierScores, quorum, weightedQuorum };
