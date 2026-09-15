'use strict';

const { AdaptiveStateService } = require('../../adaptiveStateService');

let adaptivePersister = null;
const legacyDopamineState = new Map();

function setAdaptivePersister(persister) {
  if (persister instanceof AdaptiveStateService) adaptivePersister = persister;
}

function getAdaptivePersister() {
  return adaptivePersister;
}

function getLegacyDopamine(ctxId) {
  let state = legacyDopamineState.get(ctxId);
  if (!state) {
    state = {
      ctxId,
      valeurs_attendues: new Map(),
      historique: [],
      baseline_attraction: 1.0,
      originatedAt: new Date().toISOString()
    };
    legacyDopamineState.set(ctxId, state);
  }
  return state;
}

function getDopamine(ctxId) {
  if (adaptivePersister) return adaptivePersister.getDopamineState(ctxId);
  return getLegacyDopamine(ctxId);
}

function persistDopamineIfNeeded(ctxId, state) {
  if (!adaptivePersister) return;
  adaptivePersister.setDopamineState(ctxId, state).catch(() => legacyDopamineState.set(ctxId, state));
}

function computeQValue(option) {
  const p = Math.max(0, Math.min(1, Number(option.probabilite || option.p_succes || 0.5)));
  const reward = Math.max(0, Number(option.recompense || option.reward || 1));
  const cost = Math.max(0.01, Number(option.cout || option.cost || 1));
  const risk = Math.max(0, Math.min(2, Number(option.risque || option.risk || 1)));
  const expectedValue = p * reward;
  const perceivedCost = cost * (1 + risk * 0.5);
  const q = perceivedCost > 0 ? expectedValue / perceivedCost : 0;
  return { p_succes: p, recompense: reward, cout: cost, risque: risk, valeurAttendue: expectedValue, coutPercu: perceivedCost, q_value: Number(q.toFixed(4)) };
}

function applyDopamineFeedback({ ctxId, optionId, success, magnitude }) {
  const state = getDopamine(ctxId);
  const entry = state.historique.find(item => item.optionId === optionId);
  const feedback = success ? applyPositiveFeedback : applyNegativeFeedback;
  feedback(state, { entry, optionId, magnitude });
  if (state.historique.length > 20) state.historique.shift();
  persistDopamineIfNeeded(ctxId, state);
  return state.valeurs_attendues.get(optionId) || 1.0;
}

function applyPositiveFeedback(state, { entry, optionId, magnitude }) {
  const delta = (magnitude || 0.1) * 0.5;
  if (entry) entry.attraction = Math.min(2.0, entry.attraction + delta);
  else state.valeurs_attendues.set(optionId, 1.0 + delta);
  state.historique.push({ optionId, succes: true, magnitude: magnitude || 0.1, at: Date.now() });
}

function applyNegativeFeedback(state, { entry, optionId, magnitude }) {
  const delta = (magnitude || 0.1) * 0.3;
  if (entry) entry.attraction = Math.max(0.1, entry.attraction - delta);
  else state.valeurs_attendues.set(optionId, Math.max(0.1, 1.0 - delta));
  state.historique.push({ optionId, succes: false, magnitude: magnitude || 0.1, at: Date.now() });
}

function selectBestOption(ctxId, options) {
  if (!Array.isArray(options) || options.length === 0) return { selected: null, raison: 'Aucune option fournie' };
  const state = getDopamine(ctxId);
  const scored = options.map((option, index) => {
    const id = option.id || `opt_${index}`;
    const q = computeQValue(option);
    const dopamine = state.valeurs_attendues.get(id) || state.baseline_attraction;
    return { ...option, id, q_value: q.q_value, dopamine_attraction: dopamine, score_combine: Number((q.q_value * dopamine).toFixed(4)), classement: 0 };
  });
  scored.sort((left, right) => right.score_combine - left.score_combine);
  scored.forEach((item, index) => { item.classement = index + 1; });
  return { options_scored: scored, selected: scored[0], raison: `Option "${scored[0].id || 'n1'}" selectionnee : score combine ${scored[0].score_combine}` };
}

function envelope(output) {
  return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify(output, null, 2) };
}

function handleGangliaBasals(args, run) {
  const action = (args.action || 'evaluate').toLowerCase();
  const ctxId = args.ctx_id || args.context_id || args.session || 'session-defaut';
  const handlers = {
    list: () => listState(ctxId),
    evaluate: () => selectBestOption(ctxId, Array.isArray(args.options) ? args.options : [args]),
    score: () => selectBestOption(ctxId, Array.isArray(args.options) ? args.options : [args]),
    feedback: () => feedbackState(args, ctxId),
    reward: () => feedbackState(args, ctxId)
  };
  return envelope((handlers[action] || (() => statusState(ctxId)))());
}

function listState(ctxId) {
  const state = getDopamine(ctxId);
  return { ctxId, nombre_options_suivies: state.valeurs_attendues.size, historique_longueur: state.historique.length, baseline_attraction: state.baseline_attraction, persiste: !!getAdaptivePersister() };
}

function feedbackState(args, ctxId) {
  const optionId = args.option_id || args.id || 'option-inconnue';
  const success = args.succes !== undefined ? Boolean(args.succes) : args.success !== undefined ? Boolean(args.success) : true;
  const magnitude = Number(args.magnitude || args.delta || 0.1);
  return { ctxId, optionId, feedback: success ? 'positif' : 'negatif', magnitude, nouvelle_attraction: applyDopamineFeedback({ ctxId, optionId, success, magnitude }), persiste: !!getAdaptivePersister() };
}

function statusState(ctxId) {
  const state = getDopamine(ctxId);
  const options = Array.from(state.valeurs_attendues.entries()).map(([id, attraction]) => ({ optionId: id, attraction }));
  return { ctxId, options, historique_compact: state.historique.slice(-5), persiste: !!getAdaptivePersister() };
}

function handleGangliaBasalsError(error) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: error.message };
}

module.exports = { handleGangliaBasals, handleGangliaBasalsError, setAdaptivePersister, getAdaptivePersister, computeQValue, selectBestOption, getDopamine };
