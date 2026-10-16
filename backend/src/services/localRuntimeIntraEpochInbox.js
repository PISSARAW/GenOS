'use strict';

const MAX_REVISIONS = 5;
const MODES = new Set(['refocus_diagnostics']);
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
  return MODES.has(message?.mode) && Number.isFinite(message.strength)
    && message.strength >= 0 && message.strength <= 1;
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
    reason: String(message.reason || '').slice(0, 160) };
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
  if (modulation.mode !== 'refocus_diagnostics') return '';
  return '[ADAPTATION INTRA-EPOQUE GENOS]\n'
    + 'Concentre immédiatement l’attention sur les diagnostics falsifiables : '
    + 'sépare observations, hypothèses et inconnues, puis vérifie la cause la plus risquée '
    + 'avant de poursuivre le plan. Cette consigne ne modifie ni les droits, ni le budget, '
    + 'ni les exigences de preuve.';
}

function apply(state, emitEvent) {
  if (!latest || revision <= (state.intraEpochRevision || 0)) return false;
  state.intraEpochRevision = revision;
  state.intraEpochPromptBlock = directive(latest);
  require('./localRuntimePromptLayers').rebuild(state);
  emitEvent(state, { eventType: 'INTRA_EPOCH_ATTENTION_APPLIED', action: 'REFOCUS',
    detail: 'Local runtime applied a bounded attention modulation.', status: 'running',
    payload: { revision, mode: latest.mode, strength: latest.strength,
      reason: latest.reason } });
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
