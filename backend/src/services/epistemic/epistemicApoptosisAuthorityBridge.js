'use strict';
const { randomUUID } = require('node:crypto');
const apoptosis = require('./epistemicApoptosisService');
const authority = require('./epistemicAuthorityState');

function updated(result) { return result === true || result?.changes === 1; }

async function applyPersistent(db, agentId, signals) {
  const state = await authority.accumulate(db, { agentId, signals, eventId: randomUUID() });
  if (!state.ok) return state;
  if (state.level < apoptosis.NIVEAUX.apoptosis) return { ok: false, reason: 'below_threshold', dissonance: state.dissonance };
  return { ...state, agentId, status: 'apoptotique', persistedStatus: 'apoptosis' };
}

async function applyInjected(db, agentId, input) {
  const agent = await db.get('SELECT id, name, status, role FROM agents WHERE id = ?', agentId);
  if (!agent) return { ok: false, reason: 'agent_not_found' };
  const state = apoptosis.accumulate(agent, input.signals);
  if (!apoptosis.peutApoptoser(state)) return { ok: false, reason: 'below_threshold', dissonance: state.epistemicDissonance };
  const change = await input.updateAgent(agentId, 'apoptotique', 'Apoptose épistémique');
  if (!updated(change)) return { ok: false, reason: 'authority_update_failed' };
  return { ok: true, agentId, status: 'apoptotique', dissonance: state.epistemicDissonance,
    autopsy: apoptosis.autopsy(state, 'epistemic_dissonance', input.signals.map(String)) };
}

async function revokeAuthority(db, agentId, opts) {
  const agent = await db.get('SELECT id, name, status, role FROM agents WHERE id = ?', agentId);
  if (!agent) return { ok: false, reason: 'agent_not_found' };
  const reduced = opts.level === 'reduced_authority';
  const newStatus = reduced ? 'restricted' : 'quarantined';
  if (opts.updateAgent) {
    const change = await opts.updateAgent(agentId, newStatus, String(opts.reason || 'Révocation épistémique'));
    if (!updated(change)) return { ok: false, reason: 'authority_update_failed' };
  } else {
    const previous = await db.get('SELECT dissonance FROM aeis_agent_dissonance WHERE agent_id = ?', agentId);
    const threshold = reduced ? apoptosis.SEUILS.reduced_authority : apoptosis.SEUILS.quarantine;
    await authority.accumulate(db, { agentId, eventId: randomUUID(),
      signals: [Math.max(0, threshold - (previous?.dissonance || 0))] });
  }
  return { ok: true, agentId, newStatus, reason: opts.reason };
}

async function revokeIfDissonant(db, agentId, input) {
  const { dissonance, updateAgent } = input;
  if (dissonance >= apoptosis.SEUILS.apoptosis) {
    const previous = await db.get('SELECT dissonance FROM aeis_agent_dissonance WHERE agent_id = ?', agentId);
    const signals = [Math.max(0, dissonance - (previous?.dissonance || 0))];
    return updateAgent ? applyInjected(db, agentId, { signals, updateAgent }) : applyPersistent(db, agentId, signals);
  }
  if (dissonance >= apoptosis.SEUILS.quarantine) return revokeAuthority(db, agentId, { updateAgent, level: 'quarantine', reason: 'epistemic_dissonance' });
  if (dissonance >= apoptosis.SEUILS.reduced_authority) return revokeAuthority(db, agentId, { updateAgent, level: 'reduced_authority', reason: 'epistemic_dissonance' });
  return { ok: false, reason: 'no_revocation_needed', dissonance };
}

function createApoptosisAuthorityBridge(deps = {}) {
  return {
    applyEpistemicApoptosis: (db, agentId, signals = []) => deps.updateAgent
      ? applyInjected(db, agentId, { signals, updateAgent: deps.updateAgent }) : applyPersistent(db, agentId, signals),
    revokeAuthority: (db, agentId, opts = {}) => revokeAuthority(db, agentId, { ...opts, updateAgent: deps.updateAgent }),
    revokeIfDissonant: (db, agentId, dissonance) => revokeIfDissonant(db, agentId, { dissonance, updateAgent: deps.updateAgent }),
  };
}
module.exports = { createApoptosisAuthorityBridge };
