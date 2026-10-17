'use strict';

const MAX_REVISIONS = 5;
const MODES = new Set(['hold', 'refocus_diagnostics']);
const STRUCTURAL_MODES = new Set(['safe_point_restart']);
const STRUCTURAL_TYPES = new Set(['reasoning_representation', 'phase_order', 'tool_sequence']);
let identity = null;
let boundRunId = null;
let revision = 0;
let latest = null;
let queued = [];

function validIdentity(message) {
  return message?.agentId === identity && typeof message.runId === 'string'
    && /^[A-Za-z0-9_-]{1,200}$/.test(message.runId)
    && (!boundRunId || message.runId === boundRunId);
}

function validRevision(message) {
  return Number.isSafeInteger(message?.revision)
    && message.revision > revision && message.revision <= MAX_REVISIONS;
}

function validModulation(message) {
  const attention = MODES.has(message?.mode) && Number.isFinite(message.strength)
    && message.strength >= 0 && message.strength <= 1;
  return attention && validStructural(message.structural);
}

function validStructural(structural) {
  if (!structural || structural.mode !== 'safe_point_restart') return !structural;
  const proposal = structural.proposal;
  return STRUCTURAL_MODES.has(structural.mode) && STRUCTURAL_TYPES.has(proposal?.type)
    && typeof proposal.target === 'string' && proposal.target.length > 0
    && typeof proposal.evidenceRef === 'string' && proposal.evidenceRef.length > 0;
}

function validMessage(message) {
  return validIdentity(message) && validRevision(message) && validModulation(message);
}

function accept(message) {
  if (message?.type !== 'genos-intra-epoch-modulation') return false;
  if (!identity) {
    queued = [...queued, message].slice(-MAX_REVISIONS);
    return false;
  }
  if (!validMessage(message)) return false;
  boundRunId = message.runId;
  revision = message.revision;
  latest = { mode: message.mode, strength: message.strength,
    reason: String(message.reason || '').slice(0, 160),
    structural: message.structural || null };
  return true;
}

function bind(agentId) {
  identity = agentId;
  boundRunId = null;
  revision = 0;
  latest = null;
  const backlog = queued;
  queued = [];
  backlog.forEach(accept);
}

function directive(modulation) {
  const blocks = [];
  if (modulation.mode === 'refocus_diagnostics') blocks.push(
    'Concentre immédiatement l’attention sur les diagnostics falsifiables : sépare observations, '
    + 'hypothèses et inconnues, puis vérifie la cause la plus risquée avant de poursuivre le plan.');
  if (modulation.structural) blocks.push(structuralDirective(modulation.structural.proposal));
  return blocks.length ? '[ADAPTATION INTRA-EPOQUE GENOS]\n' + blocks.join('\n')
    + '\nCette consigne ne modifie ni les droits, ni le budget, ni les exigences de preuve.' : '';
}

function structuralDirective(proposal) {
  return `Au point sûr courant, remplace la structure locale ${proposal.type} par « ${proposal.target} ». `
    + `Lie ce changement à la preuve ${proposal.evidenceRef}, puis reprends la génération depuis le checkpoint.`;
}

function apply(state, emitEvent) {
  if (!latest || revision <= (state.intraEpochRevision || 0)) return false;
  state.intraEpochRevision = revision;
  state.intraEpochPromptBlock = directive(latest);
  if (latest.structural) state.intraEpochStructure = { revision,
    ...latest.structural.proposal, appliedAt: new Date().toISOString() };
  require('./localRuntimePromptLayers').rebuild(state);
  emitEvent(state, { eventType: latest.structural
    ? 'INTRA_EPOCH_STRUCTURE_APPLIED' : 'INTRA_EPOCH_ATTENTION_APPLIED',
    action: latest.structural ? 'SAFE_POINT_RESTART' : 'REFOCUS',
    detail: 'Local runtime applied a bounded intra-epoch modulation.', status: 'running',
    payload: { revision, mode: latest.mode, strength: latest.strength,
      reason: latest.reason, structural: latest.structural } });
  return true;
}

function currentRevision() { return revision; }

function clear() {
  identity = null;
  boundRunId = null;
  revision = 0;
  latest = null;
  queued = [];
}

process.on('message', accept);

module.exports = { MAX_REVISIONS, bind, accept, apply, currentRevision, clear };
