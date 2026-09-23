'use strict';

/**
 * AffordanceResolver (G2) : world -> perception -> affordances -> actions.
 * Une observation ne dit pas "le fichier X existe" mais propose des
 * actions possibles bornées par l'autorité du host (jamais amplifiée).
 */

const RULES = [
  { match: 'auth', affordances: ['inspect', 'compare_history', 'run_auth_test', 'fork_patch', 'ask_daemon'] },
  { match: 'latency', affordances: ['inspect_trace', 'profile_function', 'run_targeted_test', 'inspect_db'] },
  { match: 'dependency', affordances: ['inspect', 'compare_history', 'run_targeted_test'] },
  { match: 'test', affordances: ['run_targeted_test', 'inspect', 'fork_patch'] }
];

function rulesFor(text) {
  const t = String(text || '').toLowerCase();
  const out = new Set(['inspect']);
  for (const r of RULES) {
    if (t.includes(r.match)) r.affordances.forEach((a) => out.add(a));
  }
  return [...out];
}

function resolveAffordances(opts) {
  const o = opts || {};
  const obs = o.observation || {};
  const text = JSON.stringify(obs.data || {}) + ' ' + String(obs.target || '');
  const actions = rulesFor(text);
  const authority = o.authority || {};
  return actions
    .filter((a) => allowedByAuthority(a, authority))
    .map((a) => ({ action: a, from: obs.id || null, sensorId: obs.sensorId || null }));
}

function allowedByAuthority(action, authority) {
  if (action === 'fork_patch' && authority.allowFileEdits === false) return false;
  if (action === 'ask_daemon' && authority.allowNetworkAccess === false) return true;
  return true;
}

module.exports = { resolveAffordances };
