'use strict';

const PHASES = ['pioneer', 'specialist', 'stabilizer'];

function advance(ecology, state, input) {
  const current = PHASES.includes(state.phase) ? state.phase : PHASES[0];
  const conditions = phaseConditions(ecology, input);
  const next = nextPhase(current, input, conditions);
  const transition = makeTransition({ current, next, ecology, input, conditions });
  const transitions = transition ? [...(state.transitions || []), transition] : state.transitions || [];
  ecology.ecologicalState.successionPhase = next;
  return { state: { ...state, phase: next, transitions }, decision: { phase: next, transition, conditions },
    action: { type: transition ? 'SUCCESSION_PHASE_ADVANCED' : 'SUCCESSION_PHASE_HELD', status: 'applied', phase: next } };
}

function nextPhase(current, input, conditions) {
  if (input.transition !== true || !conditions.ready) return current;
  return PHASES[Math.min(PHASES.indexOf(current) + 1, PHASES.length - 1)];
}

function makeTransition(options) {
  const { current, next, ecology, input, conditions } = options;
  if (next === current) return null;
  return { from: current, to: next, kind: input.primary === true ? 'primary' : 'secondary', trigger: conditions.trigger,
    evidenceRefs: strings(input.evidenceRefs), inheritedResources: clone(input.inheritedResources || ecology.resourcePool),
    inheritedMemoryRefs: strings(input.memoryRefs), tick: ecology.tick };
}

function phaseConditions(ecology, input) {
  const colonized = ecology.niches.filter((niche) => niche.status === 'colonized').length;
  const evidence = strings(input.evidenceRefs).length;
  const productivity = Number.isFinite(input.productivity) ? input.productivity : 0;
  const stability = Number.isFinite(input.stability) ? input.stability : 0;
  const readiness = [evidence > 0, colonized > 0, productivity > 0, stability >= 0.5];
  return { ready: readiness.every(Boolean), trigger: { evidence, colonizedNiches: colonized, productivity, stability } };
}

function strings(value) { return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : []; }
function clone(value) { return structuredClone(value); }

module.exports = { advance };
