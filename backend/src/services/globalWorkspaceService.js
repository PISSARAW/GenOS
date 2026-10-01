'use strict';

function admit(contents, capacity = 3) {
  const list = Array.isArray(contents) ? contents : [];
  const limit = Math.max(1, Math.floor(Number(capacity) || 3));
  const ranked = [...list].sort((a, b) => (Number(b.salience) || 0) - (Number(a.salience) || 0));
  return { admitted: ranked.slice(0, limit), evicted: ranked.slice(limit), capacity: limit, overloaded: ranked.length > limit };
}

function compete(contents, options = {}) {
  const workspace = admit(contents, options.capacity);
  const threshold = Number(options.ignitionThreshold) || 1;
  const winner = workspace.admitted.find((item) => Number(item.salience) >= threshold) || null;
  return { ...workspace, winner, ignited: Boolean(winner), globalAccess: winner ? (options.modules || ['memory', 'planning', 'reporting']) : [] };
}

function diffuse(workspace, modules) {
  const target = Array.isArray(modules) ? modules : [];
  const winner = workspace?.winner;
  const allowed = new Set(Array.isArray(workspace?.globalAccess) ? workspace.globalAccess : []);
  return target.map((module) => {
    const available = Boolean(winner && allowed.has(module));
    return { module, contentId: available ? winner.id : null, available };
  });
}

function consume(workspace, module, handler) {
  const delivery = diffuse(workspace, [module])[0];
  if (!delivery.available || typeof handler !== 'function') {
    return { ...delivery, consumed: false, output: null };
  }
  return { ...delivery, consumed: true, output: handler(delivery.contentId) };
}

function causalEffect(workspace, module, handler) {
  if (typeof handler !== 'function') return { measured: false, changed: false };
  const delivery = diffuse(workspace, [module])[0];
  if (!delivery.available) return { measured: false, changed: false };
  const delivered = handler(delivery.contentId);
  const ablated = handler(null);
  return {
    measured: true,
    changed: delivered !== ablated,
    delivered,
    ablated
  };
}

const AGOW_MODES = new Set(['off', 'shadow', 'advisory', 'bounded', 'morphogenesis-shadow', 'live', 'experimental']);

function getMode() {
  const requested = String(process.env.GENOS_AGOW_MODE || 'off').trim().toLowerCase();
  return AGOW_MODES.has(requested) ? requested : 'off';
}

function getCurrentFrame(options) {
  return require('./agow/workspaceFrameStore').current(options);
}

async function submitCandidate(options) {
  const pool = require('./agow/candidatePoolService');
  const accepted = await pool.submit(options);
  if (!accepted.accepted) return accepted;
  const { candidate } = options;
  try {
    const transport = require('./signalingTransportService');
    const { SIGNAL_TYPES } = require('./biomimeticSignalingBus');
    const signal = await transport.publishSignal({
      signalType: SIGNAL_TYPES.LIGAND,
      topic: `agow:candidate:${candidate.agentId}`,
      senderAgentId: candidate.agentId,
      signalData: { semanticType: 'cognitive_candidate', candidateRef: candidate.candidateId, modality: candidate.source.modality }
    });
    if (signal?.published !== true) {
      if (!accepted.merged) await pool.remove({ agentId: candidate.agentId, candidateId: candidate.candidateId, db: options.db });
      return { accepted: false, reason: 'signal_plane_rejected', signal };
    }
    const cycleResult = options.triggerCycle === false ? null : await cycle({ agentId: candidate.agentId, db: options.db, now: options.now, activeGoal: options.activeGoal, unresolvedQuestions: options.unresolvedQuestions });
    return { ...accepted, signal, cycle: cycleResult };
  } catch (error) {
    if (!accepted.merged) await pool.remove({ agentId: candidate.agentId, candidateId: candidate.candidateId, db: options.db });
    return { accepted: false, reason: 'signal_plane_failed', message: error.message };
  }
}

function cycle(options) {
  return require('./agow/workspaceCycleService').cycle(options);
}

function query(options) {
  return require('./agow/workspaceQueryService').plan(options);
}

function subscribe(options) {
  const bus = require('./signalEventBus');
  const topic = `agow:candidate:${options.agentId}`;
  bus.onTopic(topic, options.listener);
  return () => bus.removeListener(`topic:${topic}`, options.listener);
}

module.exports = { admit, compete, diffuse, consume, causalEffect, getMode, getCurrentFrame, submitCandidate, cycle, query, subscribe };
