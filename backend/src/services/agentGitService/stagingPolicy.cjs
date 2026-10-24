'use strict';

const SECTIONS = new Set(['agent', 'decisions', 'memories', 'runs', 'plasmids', 'permissions',
  'events', 'children', 'relations', 'epistemicClaims', 'epistemicContradictions']);

function stageable(section) {
  return SECTIONS.has(section);
}

function buildStagedState(parent, current, staged) {
  const base = parent || { schema: 'genos.agent-git-state/v1', agent: current.agent };
  const state = { ...base, capturedAt: new Date().toISOString() };
  for (const [section, value] of Object.entries(staged)) {
    if (!stageable(section)) throw new Error(`Section cannot be staged: ${section}`);
    state[section] = value;
  }
  if (!state.agent?.id || state.agent.id !== current.agent.id) {
    throw new Error('Staged identity differs from the scoped agent.');
  }
  return state;
}

function unstagedSections(base, current, staged) {
  return [...SECTIONS].filter((section) => {
    const comparison = Object.hasOwn(staged, section) ? staged[section] : base?.[section];
    const fallback = section === 'agent' ? null : [];
    return JSON.stringify(current[section] ?? fallback) !== JSON.stringify(comparison ?? fallback);
  });
}

module.exports = { stageable, buildStagedState, unstagedSections };
