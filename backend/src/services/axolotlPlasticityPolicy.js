'use strict';
const store = require('./axolotlStateStore');
const STATES = Object.freeze(['NEOTENIC', 'PLASTIC', 'DIFFERENTIATING', 'CONSOLIDATING', 'STABLE', 'EMERGENCY_PLASTIC']);
const TRANSITIONS = Object.freeze({
  NEOTENIC: ['PLASTIC', 'DIFFERENTIATING', 'EMERGENCY_PLASTIC'],
  PLASTIC: ['NEOTENIC', 'DIFFERENTIATING', 'EMERGENCY_PLASTIC'],
  DIFFERENTIATING: ['PLASTIC', 'CONSOLIDATING', 'EMERGENCY_PLASTIC'],
  CONSOLIDATING: ['STABLE', 'PLASTIC', 'EMERGENCY_PLASTIC'],
  STABLE: ['NEOTENIC', 'PLASTIC', 'EMERGENCY_PLASTIC'],
  EMERGENCY_PLASTIC: ['PLASTIC', 'DIFFERENTIATING']
});
const COOLDOWN_MS = 30000;
const BUDGET_WINDOW_MS = 3600000;
function initial(id) {
  return { id, state: 'NEOTENIC', changes: 0, budget: 10, lastChangeAt: null, budgetWindowAt: Date.now(), history: [] };
}
function refreshBudget(previous) {
  return Date.now() - previous.budgetWindowAt >= BUDGET_WINDOW_MS
    ? { ...previous, budget: 10, budgetWindowAt: Date.now() } : previous;
}
function reject(request, previous) {
  if (!request.id || !STATES.includes(request.to) || !String(request.reason || '').trim()) return 'valid_id_state_and_reason_required';
  if (!TRANSITIONS[previous.state]?.includes(request.to)) return 'transition_not_allowed';
  if (previous.budget <= 0) return 'change_budget_exhausted';
  if (request.to !== 'EMERGENCY_PLASTIC' && previous.lastChangeAt && Date.now() - previous.lastChangeAt < COOLDOWN_MS) return 'cooldown_active';
  return null;
}
async function verifyTransition(db, input) {
  if (!['CONSOLIDATING', 'STABLE', 'EMERGENCY_PLASTIC'].includes(input.to)) return;
  const refs = [...new Set(input.evidenceRefs || [])];
  const active = await store.read(db, { kind: 'topology', id: input.id });
  if (!active) throw store.error('AXOLOTL_ACTIVE_TOPOLOGY_REQUIRED');
  const proofs = await Promise.all(refs.map((ref) => store.evidence(db, ref)));
  const valid = validProofs(proofs, { input, active });
  if (input.to === 'EMERGENCY_PLASTIC') {
    if (!valid.some((proof) => proof.result.passed === false)) throw store.error('AXOLOTL_EMERGENCY_EVIDENCE_REQUIRED');
    return;
  }
  await verifyStability(db, { valid, input, active });
}
function validProofs(proofs, { input, active }) {
  return proofs.filter((proof) => proof.orchestratorId === input.id && proof.subjectHash === store.hash(active.topology)
    && proof.result.isolated === true && Date.now() - proof.observedAt < 300000);
}
async function verifyStability(db, { valid, input, active }) {
  const minimum = input.to === 'STABLE' ? 3 : 2;
  if (valid.length < minimum || valid.some((proof) => proof.result.passed !== true)) throw store.error('AXOLOTL_STABILITY_EVIDENCE_REQUIRED');
  const runs = new Set(valid.map((proof) => proof.runId));
  if (runs.size < minimum) throw store.error('AXOLOTL_STABILITY_WINDOWS_REQUIRED');
  if (new Set(valid.map((proof) => proof.contractHash)).size !== 1) throw store.error('AXOLOTL_STABILITY_CONTRACT_MISMATCH');
  const recent = recentObservations(await store.list(db, 'observation'), { input, active, minimum });
  if (recent.length < minimum || recent.some((item) => !item.result.passed)) throw store.error('AXOLOTL_STABILITY_HYSTERESIS_FAILED');
}
function recentObservations(observations, { input, active, minimum }) {
  return observations.filter((item) => item.orchestratorId === input.id && item.subjectHash === store.hash(active.topology))
    .sort((a, b) => b.observedAt - a.observedAt).slice(0, minimum);
}
function nextState(previous, request) {
  const at = Date.now();
  return { ...previous, state: request.to, changes: previous.changes + 1, budget: previous.budget - 1,
    lastChangeAt: at, reason: request.reason.trim(), history: [...(previous.history || []), {
      from: previous.state, to: request.to, reason: request.reason.trim(), evidenceRefs: request.evidenceRefs || [], at
    }].slice(-100) };
}
module.exports = { STATES, TRANSITIONS, initial, refreshBudget, reject, verifyTransition, nextState };
