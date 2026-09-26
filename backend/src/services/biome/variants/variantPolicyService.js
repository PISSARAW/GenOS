'use strict';

const DEFINITIONS = Object.freeze({
  resource: { scope: 'mission', minimumAllocationRatio: 0.05, focus: 'Prioritize explicit demand, scarcity, and fair resource allocation.' },
  exploration: { scope: 'mission', environmentThreshold: 0.2, focus: 'Explore unknown patches and report information gain, uncertainty, and evidence.' },
  quality_diversity: { scope: 'mission', diversityTarget: 0.7, focus: 'Preserve distinct niches and compare quality across diverse solutions.' },
  successional: { scope: 'workspace', phases: ['pioneer', 'specialist', 'stabilizer'], focus: 'Move from pioneer to specialist to stabilizer only when evidence, colonization, productivity, and stability gates pass.' },
  resilience: { scope: 'mission', minimumAllocationRatio: 0.1, recoveryReserveRatio: 0.15, focus: 'Maintain recovery capacity and identify failure and recolonization paths.' },
  persistent: { scope: 'persistent', persistence: true, focus: 'Record durable changes, dependencies, and reusable environmental knowledge.' },
  open_ended: { scope: 'workspace', growthThreshold: 0, focus: 'Discover useful new niches while labeling unverified opportunities as hypotheses.' },
  adversarial: { scope: 'mission', adversarialReview: true, focus: 'Challenge population claims with counterexamples and report unresolved risks.' },
  knowledge: { scope: 'workspace', sourceNiches: true, focus: 'Treat source collections as niches; cite provenance and compare independent sources.' },
  compute: { scope: 'mission', computeAware: true, focus: 'Include compute availability, execution location, and resource constraints in allocations.' },
  multi_scale: { scope: 'workspace', levels: ['individual', 'population', 'ecosystem'], focus: 'Report effects at individual, population, and ecosystem levels.' }
});
const RULES = Object.freeze([
  ['resilience', /critical|resilien|résilien|recovery|recover|panne|outage|failure|effondr/i],
  ['adversarial', /security|sécurité|threat|menace|attack|attaque|red.team|adversarial/i],
  ['compute', /compute|gpu|cpu|hardware|matériel|local.cloud|cloud.local/i],
  ['persistent', /persistent|durable|workspace|long.term|longue durée|projet long/i],
  ['multi_scale', /multi.scale|large.scale|grande échelle|many agents|nombreux agents/i],
  ['successional', /phase|succession|long.project|projet long|stages/i],
  ['knowledge', /\bknowledge\b|\bsources?\b|citation|veille|littérature|literature|research/i],
  ['quality_diversity', /quality.diversity|quality and diversity|diversité|diversity|creative|créativ/i],
  ['open_ended', /open.ended|open problem|problème ouvert|novel|nouveau|discover|découvr/i],
  ['exploration', /explor|unknown|inconnu|debug|forag|investigat/i],
  ['resource', /resource|ressource|budget|allocation|scarcity|rareté/i]
]);

function list() {
  return Object.keys(DEFINITIONS);
}

function resolve(name) {
  const requested = String(name || '').trim().toLowerCase().replaceAll('-', '_');
  const id = requested === 'succession' ? 'successional' : requested;
  if (!DEFINITIONS[id]) throw variantError('Unknown Biome variant.', 'BIOME_VARIANT_UNKNOWN');
  return { variant: id, ...structuredClone(DEFINITIONS[id]) };
}

function select(mission, options = {}) {
  const requested = options.variant || options.variantId;
  if (requested) return { ...resolve(requested), selection: receipt({ variant: requested, method: 'explicit', reasons: ['EXPLICIT_VARIANT'], confidence: 1 }) };
  const text = String(mission || '');
  const matched = RULES.filter(([, pattern]) => pattern.test(text)).map(([variant]) => variant);
  const selected = matched[0] || 'resource';
  return {
    ...resolve(selected),
    scope: options.scope || DEFINITIONS[selected].scope,
    selection: receipt({ variant: selected, method: matched.length ? 'mission_signals' : 'safe_baseline',
      reasons: matched.length ? matched.map((variant) => `MISSION_PROFILE:${variant}`) : ['NO_DISCRIMINATING_MISSION_SIGNAL'],
      confidence: matched.length ? 0.8 : 0.5 })
  };
}

function receipt(selection) {
  return selection;
}

function variantError(message, code) {
  return Object.assign(new Error(message), { code });
}

module.exports = { DEFINITIONS, list, resolve, select };
