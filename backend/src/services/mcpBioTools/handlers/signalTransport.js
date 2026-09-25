/**
 * MCP Handlers — Signal Transport Zero-Texte (§45)
 *
 * Une collection de handlers MCP pour les 7 outils de signalisation zero-texte.
 * Chaque handler publie/lit/consomme les signaux via le transport persistant.
 */

const { publishSignal, readSignalsForAgent, markSignalsSeen, purgeExpiredSignals, recordSignalGrounding } = require('../../signalingTransportService');
const {
  electocyteDecision,
  chemotacticFollow,
  orchestrateCollectiveDecision,
} = require('../../agentCollaborativeDecisionMakingService');

// ── genos_signal_publish ─────────────────────────────────────────────────────

async function handleSignalPublish(args, run) {
  const { signal_type, signal_data, topic, ttl_ms, signal_id, orchestrator_id } = args || {};
  if (signal_type === undefined || signal_type === null || String(signal_type).trim() === '') {
    return { configured: true, success: false, status: 'invalid_args', error: 'signal_type: is required.', transport: 'zero_text' };
  }
  const result = await publishSignal({
    signalType: signal_type,
    signalData: signal_data || {},
    topic: topic || '',
    senderAgentId: orchestrator_id || null,
    ttlMs: ttl_ms != null ? Number(ttl_ms) : undefined,
    signalId: signal_id || undefined,
  });
  return {
    configured: true,
    success: true,
    status: 'signal_published',
    signalId: result.signalId,
    signalType: result.signalType,
    transport: 'zero_text',
  };
}

function handleSignalPublishError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    error: e.message,
    transport: 'zero_text',
  };
}

// ── genos_signal_read ────────────────────────────────────────────────────────

async function handleSignalRead(args, run) {
  const { agent_id, since, limit } = args || {};
  if (agent_id === undefined || agent_id === null || String(agent_id).trim() === '') {
    return { configured: true, success: false, status: 'invalid_args', error: 'agent_id: is required.', transport: 'zero_text' };
  }
  const signals = await readSignalsForAgent(
    agent_id || 'unknown',
    since || null,
    limit != null ? Number(limit) : 100
  );
  // Mark signals as seen to prevent re-read loops
  if (signals.length > 0 && agent_id) {
    await markSignalsSeen(agent_id, signals.map(s => s.signalId));
  }
  return {
    configured: true,
    success: true,
    status: 'signals_read',
    count: signals.length,
    signals: signals.map(s => ({
      signalId: s.signalId,
      signalType: s.signalType,
      topic: s.topic,
      senderAgentId: s.senderAgentId,
      createdAt: s.createdAt,
      content: s.content,
      decoded: s.decoded,
      integrity: s.integrity,
    })),
    transport: 'zero_text',
  };
}

function handleSignalReadError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    error: e.message,
    transport: 'zero_text',
  };
}

async function handleSignalGround(args) {
  const { signal_id, agent_id, grounding_level, semantic_hash, contract_version } = args || {};
  if (!signal_id || !agent_id || !grounding_level) {
    return { configured: true, success: false, status: 'invalid_args', error: 'signal_id, agent_id and grounding_level are required.', transport: 'zero_text' };
  }
  const result = await recordSignalGrounding({
    signalId: signal_id, subscriberAgentId: agent_id, groundingLevel: grounding_level,
    semanticHash: semantic_hash, contractVersion: contract_version
  });
  return {
    configured: true, success: result.recorded, status: result.recorded ? 'grounding_recorded' : 'grounding_rejected',
    reason: result.reason || null, transport: 'zero_text'
  };
}

function handleSignalGroundError(e) {
  return { configured: true, success: false, status: 'tool_error', error: e.message, transport: 'zero_text' };
}

// ── genos_signal_purge ───────────────────────────────────────────────────────

async function handleSignalPurge(args, run) {
  await purgeExpiredSignals();
  return {
    configured: true,
    success: true,
    status: 'signals_purged',
    transport: 'zero_text',
  };
}

function handleSignalPurgeError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    error: e.message,
    transport: 'zero_text',
  };
}

// ── genos_signal_electrocyte_vote ────────────────────────────────────────────

async function handleSignalElectrocyteVote(args, run) {
  const { topic, discharges, threshold_mv } = args || {};
  const result = await electocyteDecision(
    topic || 'default',
    discharges || [],
    { thresholdMv: threshold_mv != null ? Number(threshold_mv) : undefined }
  );
  return {
    configured: true,
    success: true,
    status: 'electrocyte_decision',
    consensusReached: result.consensusReached,
    totalVoltageMv: result.totalVoltageMv,
    thresholdMv: result.thresholdMv,
    kuramotoOrder: result.kuramotoOrder,
    participantCount: result.participantCount,
    transport: 'zero_text',
  };
}

function handleSignalElectrocyteVoteError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    error: e.message,
    transport: 'zero_text',
  };
}

// ── genos_signal_chemotactic_follow ──────────────────────────────────────────

async function handleSignalChemotacticFollow(args, run) {
  const { agent_id, locus_hash, since } = args || {};
  if (agent_id === undefined || agent_id === null || String(agent_id).trim() === '') {
    return { configured: true, success: false, status: 'invalid_args', error: 'agent_id: is required.', transport: 'zero_text' };
  }
  const result = await chemotacticFollow(
    agent_id || 'unknown',
    locus_hash || '',
    since || null,
  );
  return {
    configured: true,
    success: true,
    status: 'chemotactic_gradient',
    locusHash: result.locusHash,
    netGradient: result.netGradient,
    signalsRead: result.signalsRead,
    transport: 'zero_text',
  };
}

function handleSignalChemotacticFollowError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    error: e.message,
    transport: 'zero_text',
  };
}

// ── genos_signal_plasmid_transfer ────────────────────────────────────────────

async function handleSignalPlasmidTransfer(args, run) {
  const { problem, voters } = args || {};
  const result = await orchestrateCollectiveDecision(
    problem || 'default',
    voters || [],
    'plasmid',
  );
  return {
    configured: true,
    success: true,
    status: result.status,
    mode: result.mode,
    problem: result.problem,
    recipients: result.recipients,
    transport: 'zero_text',
  };
}

function handleSignalPlasmidTransferError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    error: e.message,
    transport: 'zero_text',
  };
}

// ── genos_signal_collective_decision ─────────────────────────────────────────

async function handleSignalCollectiveDecision(args, run) {
  const { problem, voters, mode } = args || {};
  const result = await orchestrateCollectiveDecision(
    problem || 'default',
    voters || [],
    mode || 'electrocyte',
  );
  return {
    configured: true,
    success: true,
    status: result.status,
    mode: result.mode,
    problem: result.problem,
    transport: 'zero_text',
  };
}

function handleSignalCollectiveDecisionError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    error: e.message,
    transport: 'zero_text',
  };
}

module.exports = {
  handleSignalPublish,
  handleSignalPublishError,
  handleSignalRead,
  handleSignalReadError,
  handleSignalGround,
  handleSignalGroundError,
  handleSignalPurge,
  handleSignalPurgeError,
  handleSignalElectrocyteVote,
  handleSignalElectrocyteVoteError,
  handleSignalChemotacticFollow,
  handleSignalChemotacticFollowError,
  handleSignalPlasmidTransfer,
  handleSignalPlasmidTransferError,
  handleSignalCollectiveDecision,
  handleSignalCollectiveDecisionError,
};
