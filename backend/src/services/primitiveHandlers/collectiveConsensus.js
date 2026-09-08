/**
 * Lot 5 Primitives: Swarm Consensus & Quorum
 * (brier_scores, quorum, weighted_quorum)
 */
const telemetry = require('../telemetryObserver');
const { getDatabase } = require('../../db');

function brierScoreToWeight(brier) {
  if (!Number.isFinite(brier)) return 1.0;
  if (brier >= 1.0) return 0.0;
  if (brier >= 0.5) {
    return Math.max(0, 0.1 * (1 - brier));
  }
  return Math.pow(1 - brier, 2);
}

function calculateItemBrierScore(item) {
  if (!item) return NaN;

  // Case 1: Multi-class array [p1, p2, ...]
  if (Array.isArray(item.prediction)) {
    const p = item.prediction.map(Number);
    if (p.length < 2 || p.some(v => !Number.isFinite(v) || v < 0 || v > 1) || Math.abs(p.reduce((sum, value) => sum + value, 0) - 1) > 1e-6) return NaN;

    let o;
    if (Array.isArray(item.outcome)) {
      o = item.outcome.map(Number);
      if (o.length !== p.length || o.some(v => !Number.isFinite(v) || (v !== 0 && v !== 1))) return NaN;
    } else if (Number.isInteger(Number(item.outcome)) && Number(item.outcome) >= 0 && Number(item.outcome) < p.length) {
      const idx = Number(item.outcome);
      o = p.map((_, i) => (i === idx ? 1 : 0));
    } else {
      return NaN;
    }

    const sumSq = p.reduce((acc, prob, i) => acc + (prob - o[i]) ** 2, 0);
    return sumSq / 2; // Normalized multiclass Brier score in [0, 1]
  }

  // Case 2: Multi-class object { classA: 0.8, classB: 0.2 }
  if (item.prediction && typeof item.prediction === 'object') {
    const keys = Object.keys(item.prediction);
    if (keys.length < 2) return NaN;
    const p = keys.map(k => Number(item.prediction[k]));
    if (p.some(v => !Number.isFinite(v) || v < 0 || v > 1) || Math.abs(p.reduce((sum, value) => sum + value, 0) - 1) > 1e-6) return NaN;

    let o;
    if (typeof item.outcome === 'string' && keys.includes(item.outcome)) {
      o = keys.map(k => (k === item.outcome ? 1 : 0));
    } else if (item.outcome && typeof item.outcome === 'object') {
      o = keys.map(k => Number(item.outcome[k] || 0));
      if (o.some(v => !Number.isFinite(v) || (v !== 0 && v !== 1)) || o.reduce((sum, value) => sum + value, 0) !== 1) return NaN;
    } else {
      return NaN;
    }

    const sumSq = p.reduce((acc, prob, i) => acc + (prob - o[i]) ** 2, 0);
    return sumSq / 2;
  }

  // Case 3: Binary scalar
  const prediction = Number(item.prediction);
  const outcome = Number(item.outcome);
  if (!Number.isFinite(prediction) || prediction < 0 || prediction > 1 || !Number.isFinite(outcome) || (outcome !== 0 && outcome !== 1)) {
    return NaN;
  }
  return (prediction - outcome) ** 2;
}

async function brierScores(context = {}) {
  const agentIds = context.agentIds || [];
  if (agentIds.length === 0) return { success: true, scores: {} };
  const observations = context.calibrationObservations || [];
  const suppliedScores = context.calibrationScores || {};
  const scores = {};
  const db = await getDatabase();

  for (const id of agentIds) {
    const agentObservations = observations.filter((item) => item.agentId === id);
    let score = agentObservations.length > 0
      ? agentObservations.reduce((sum, item) => sum + calculateItemBrierScore(item), 0) / agentObservations.length
      : Number(suppliedScores[id]);

    if (!Number.isFinite(score) || score < 0 || score > 1) {
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

async function recordConsensusMessage(db, orchestratorId, kind, issue, decision, quorumReached, data = {}) {
  if (!db) return;
  try {
    const state = await db.get('SELECT organization, version FROM agent_organization_state WHERE orchestrator_id = ?', orchestratorId);
    await db.run(
      `INSERT INTO agent_organization_messages (orchestrator_id, organization, organization_version, sender_agent_id, recipient_agent_id, channel, kind, content, payload_json)
       VALUES (?, ?, ?, ?, NULL, 'consensus', ?, ?, ?)`,
      orchestratorId,
      state?.organization || 'collective', state?.version || 1,
      orchestratorId,
      kind,
      quorumReached ? `Consensus reached on ${issue}: ${decision}` : `Consensus not reached on ${issue}`,
      JSON.stringify({ issue, decision, quorumReached, ...data })
    );
  } catch (_) {}
}

async function quorum(context = {}) {
  const db = await getDatabase();
  const orchestratorId = context.orchestratorId;
  const issue = context.issue || 'default_issue';
  if (!orchestratorId) return { success: false, error: 'orchestratorId required.' };

  try {
    const rows = await db.all(
      `SELECT sender_agent_id, payload_json FROM agent_organization_messages 
       WHERE orchestrator_id = ? AND kind = 'vote'
         AND (json_extract(payload_json, '$.issue') = ? OR json_extract(payload_json, '$.issue') IS NULL)
       ORDER BY id DESC`,
      orchestratorId, issue
    );

    const votes = {};
    const hasVoted = new Set();
    for (const row of rows) {
      if (hasVoted.has(row.sender_agent_id)) continue;
      try {
        const payload = JSON.parse(row.payload_json);
        if (payload.issue === issue && payload.vote !== undefined && payload.vote !== null) {
          const voteStr = String(payload.vote).trim();
          if (voteStr.toLowerCase() !== 'abstain') {
            votes[voteStr] = (votes[voteStr] || 0) + 1;
          }
          hasVoted.add(row.sender_agent_id);
        }
      } catch (_) {}
    }

    // Interoperabilite : integrer les votes de swarm_votes si la proposition correspondante existe
    if (db) {
      try {
        const proposal = await db.get(
          'SELECT id FROM swarm_proposals WHERE id = ? OR title = ? ORDER BY created_at DESC LIMIT 1',
          issue, issue
        );
        if (proposal) {
          const restVotes = await db.all(
            'SELECT agent_id, vote FROM swarm_votes WHERE proposal_id = ?',
            proposal.id
          );
          for (const rv of restVotes) {
            if (hasVoted.has(rv.agent_id)) continue;
            if (rv.vote !== undefined && rv.vote !== null) {
              const rvVoteStr = String(rv.vote).trim();
              if (rvVoteStr.toLowerCase() !== 'abstain') {
                votes[rvVoteStr] = (votes[rvVoteStr] || 0) + 1;
              }
              hasVoted.add(rv.agent_id);
            }
          }
        }
      } catch (_) {}
    }

    const minParticipation = context.minVotes !== undefined ? context.minVotes : (context.minParticipation !== undefined ? context.minParticipation : 1);
    const threshold = Number.isFinite(context.threshold) ? context.threshold : (Number.isFinite(context.quorumThreshold) ? context.quorumThreshold : 0.5);

    const totalExpressed = Object.values(votes).reduce((sum, val) => sum + val, 0);
    const abstentions = hasVoted.size - totalExpressed;
    const sortedOptions = Object.keys(votes).sort((a, b) => {
      const diff = votes[b] - votes[a];
      if (diff !== 0) return diff;
      return a.localeCompare(b);
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
      payload: { issue, decision, quorumReached, votes, totalVotes: hasVoted.size, expressedVotes: totalExpressed, abstentions, approvalRate }
    });

    await recordConsensusMessage(db, orchestratorId, 'consensus_resolution', issue, decision, quorumReached, {
      votes, totalVotes: hasVoted.size, expressedVotes: totalExpressed, abstentions, approvalRate
    });

    return {
      success: true,
      issue,
      decision,
      quorumReached,
      votes,
      totalVotes: hasVoted.size,
      expressedVotes: totalExpressed,
      abstentions,
      approvalRate,
      ...(quorumReached ? {} : { error: 'Quorum not reached' })
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function weightedQuorum(context = {}) {
  const db = await getDatabase();
  const orchestratorId = context.orchestratorId;
  const issue = context.issue || 'default_issue';
  if (!orchestratorId) return { success: false, error: 'orchestratorId required.' };

  try {
    const rows = await db.all(
      `SELECT sender_agent_id, payload_json FROM agent_organization_messages 
       WHERE orchestrator_id = ? AND kind = 'vote'
         AND (json_extract(payload_json, '$.issue') = ? OR json_extract(payload_json, '$.issue') IS NULL)
       ORDER BY id DESC`,
      orchestratorId, issue
    );

    const relevantVoterIds = [];
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload_json);
        if (payload.issue === issue && payload.vote) {
          relevantVoterIds.push(row.sender_agent_id);
        }
      } catch (_) {}
    }

    const agentIds = [...new Set(relevantVoterIds)];
    const brierRes = await brierScores({
      agentIds,
      calibrationScores: context.calibrationScores,
      calibrationObservations: context.calibrationObservations,
      allowDefaults: true,
      defaultScore: context.defaultScore ?? 0.25
    });
    if (!brierRes.success) return brierRes;
    const bScores = brierRes.scores || {};

    const weightedVotes = {};
    const hasVoted = new Set();
    let expressedVoters = 0;

    for (const row of rows) {
      if (hasVoted.has(row.sender_agent_id)) continue;
      try {
        const payload = JSON.parse(row.payload_json);
        if (payload.issue === issue && payload.vote !== undefined && payload.vote !== null) {
          const voteStr = String(payload.vote).trim();
          if (voteStr.toLowerCase() !== 'abstain') {
            const brier = bScores[row.sender_agent_id] !== undefined ? bScores[row.sender_agent_id] : 0.25;
            const weight = brierScoreToWeight(brier);
            weightedVotes[voteStr] = (weightedVotes[voteStr] || 0) + weight;
            expressedVoters += 1;
          }
          hasVoted.add(row.sender_agent_id);
        }
      } catch (_) {}
    }

    // Interoperabilite : integrer les votes de swarm_votes si la proposition correspondante existe
    if (db) {
      try {
        const proposal = await db.get(
          'SELECT id FROM swarm_proposals WHERE id = ? OR title = ? ORDER BY created_at DESC LIMIT 1',
          issue, issue
        );
        if (proposal) {
          const restVotes = await db.all(
            'SELECT agent_id, vote, weight, brier_score FROM swarm_votes WHERE proposal_id = ?',
            proposal.id
          );
          for (const rv of restVotes) {
            if (hasVoted.has(rv.agent_id)) continue;
            if (rv.vote !== undefined && rv.vote !== null) {
              const rvVoteStr = String(rv.vote).trim();
              if (rvVoteStr.toLowerCase() !== 'abstain') {
                let weight = 1.0;
                if (Number.isFinite(rv.brier_score)) {
                  weight = brierScoreToWeight(rv.brier_score);
                } else if (Number.isFinite(rv.weight)) {
                  weight = Number(rv.weight);
                }
                weightedVotes[rvVoteStr] = (weightedVotes[rvVoteStr] || 0) + weight;
                expressedVoters += 1;
              }
              hasVoted.add(rv.agent_id);
            }
          }
        }
      } catch (_) {}
    }

    const minParticipation = context.minVotes !== undefined ? context.minVotes : (context.minParticipation !== undefined ? context.minParticipation : 1);
    const threshold = Number.isFinite(context.threshold) ? context.threshold : (Number.isFinite(context.quorumThreshold) ? context.quorumThreshold : 0.5);

    const totalExpressedWeight = Object.values(weightedVotes).reduce((sum, w) => sum + w, 0);
    const abstentions = Math.max(0, hasVoted.size - expressedVoters);
    const sortedOptions = Object.keys(weightedVotes).sort((a, b) => {
      const diff = weightedVotes[b] - weightedVotes[a];
      if (Math.abs(diff) > 1e-9) return diff;
      return a.localeCompare(b);
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
      payload: { issue, decision, quorumReached, weightedVotes, totalVotes: hasVoted.size, totalWeight: totalExpressedWeight, abstentions, approvalRate }
    });

    await recordConsensusMessage(db, orchestratorId, 'weighted_consensus_resolution', issue, decision, quorumReached, {
      weightedVotes, totalVotes: hasVoted.size, totalWeight: totalExpressedWeight, abstentions, approvalRate
    });
    await recordConsensusMessage(db, orchestratorId, 'consensus_resolution', issue, decision, quorumReached, {
      weightedVotes, totalVotes: hasVoted.size, totalWeight: totalExpressedWeight, approvalRate
    });

    return {
      success: true,
      issue,
      decision,
      quorumReached,
      weightedVotes,
      weightedTally: weightedVotes,
      totalVotes: hasVoted.size,
      abstentions,
      totalWeight: totalExpressedWeight,
      approvalRate,
      ...(quorumReached ? {} : { error: 'Quorum not reached' })
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { brierScores, quorum, weightedQuorum };
