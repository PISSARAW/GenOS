'use strict';

/**
 * Canonical philosophical vocabulary — reclassified with operational categories.
 *
 * Four (plus speculative) categories replace the previous homogeneous `status` field:
 *   core commitment     — GenOS assumes this principle as operational constraint
 *   operational theory  — testable computational hypothesis
 *   biomimetic analogy  — natural mechanism transferred under explicit conditions
 *   interpretive lens   — intellectual framework for analysis, not runtime authority
 *   speculative hypothesis — worth exploring but not promoted to GenOS truth
 *
 * New metadata fields: runtimeAuthority, falsifiable, scope, knownLimits, historicalConfidence
 */

const FAMILY_BY_DOMAIN = Object.freeze({
  ontology: 'ontology',
  modality: 'metaphysics',
  schools: 'philosophical-traditions',
  metaphysics: 'metaphysics',
  phenomenology: 'phenomenology',
  process: 'process-philosophy',
  epistemology: 'epistemology',
  methods: 'epistemology',
  science: 'philosophy-of-science',
  truth: 'epistemology',
  'social-epistemology': 'social-and-critical-thought',
  mathematics: 'philosophy-of-mathematics',
  politics: 'political-power',
  aesthetics: 'aesthetics',
  'art-theory': 'aesthetics',
  interpretation: 'aesthetics',
  play: 'aesthetics',
  narrative: 'aesthetics',
  cinema: 'aesthetics',
  music: 'aesthetics',
  architecture: 'aesthetics',
  design: 'aesthetics',
  'digital-art': 'aesthetics',
  video: 'aesthetics',
  'art-movements': 'aesthetics',
});

const { CORE_DEFINITIONS: OLD_CORE } = require('./coreDefinitions');
const { AESTHETICS_DEFINITIONS } = require('./aestheticsDefinitions');
const { LOGIC_DEFINITIONS } = require('./logicDefinitions');
const { MATHEMATICS_DEFINITIONS } = require('./mathematicsDefinitions');

const C = (opts) => {
  const {
    id, label, domain, school, status, service = null, metadata = {},
    role, runtimeAuthority, falsifiable, scope, knownLimits,
    historicalConfidence, ...rest
  } = opts;

  const base = {
    id, label, domain, school, status, service,
    family: metadata.family || FAMILY_BY_DOMAIN[domain] || domain,
    role,
    runtimeAuthority: runtimeAuthority !== undefined ? runtimeAuthority : false,
    falsifiable: falsifiable !== undefined ? falsifiable : hasFalsifiability(id, domain, school),
    scope: scope || deriveScope(id, domain),
    knownLimits: knownLimits || deriveKnownLimits(id, domain, school),
    historicalConfidence: historicalConfidence !== undefined ? historicalConfidence : deriveConfidence(status, role),
    ...rest,
  };

  // Deprecate `implemented` in favor of role-based classification
  if (status === 'implemented' && !role) {
    base.status = 'conceptual_only';
    base.note = 'Previously "implemented"; reclassified without role assignment';
  }

  return base;
};

// Helper: determine if a concept has natural falsifiability
const hasFalsifiability = (id, domain, school) => {
  const falsifiableDomains = ['causality', 'epistemology', 'science', 'metaphysics'];
  const falsifiableSchools = ['analytic', 'hume', 'popper', 'kant', 'leibniz'];
  return falsifiableDomains.includes(domain) || falsifiableSchools.includes(school);
};

// Helper: derive scope from concept ID pattern
const deriveScope = (id, domain) => {
  const scopeMap = {
    ontology: 'ontological',
    causality: 'causal',
    epistemology: 'epistemic',
    metaphysics: 'metaphysical',
    time-space: 'temporal',
    process: 'processual',
    schools: 'traditional',
    phenomenology: 'phenomenological',
  };
  return scopeMap[domain] || 'general';
};

// Helper: derive known limits based on concept
const deriveKnownLimits = (id, domain, school) => {
  const limits = [];
  if (domain === 'epistemology' && id.includes('gettier')) limits.push('Gettier problems');
  if (domain === 'causality' && id.includes('counterfactual')) limits.push('Counterfactual dependence on world similarity');
  if (domain === 'metaphysics' && school === 'stoicism') limits.push('Reduction to "logos" oversimplifies');
  if (domain === 'metaphysics' && school === 'epicurus') limits.push('Soul-as-atoms is interpretive reconstruction');
  if (domain === 'politics' && id.includes('social-contract')) limits.push('Actual consent scenarios are idealized');
  if (domain === 'ethics' && id.includes('utilitarianism')) limits.push('No universal distribution or horizon specified');
  if (domain === 'ethics' && id.includes('virtue')) limits.push('Meaning of virtues is culturally contingent');
  if (domain === 'schools' && school === 'stoicism') limits.push('"isMonist()" hardcoded to true — not an evaluation');
  if (domain === 'schools' && school === 'epicureanism') limits.push('atomSchema creates 3 atom types — not Epicurus\' thesis');
  if (domain === 'metaphysics' && id.includes('qualia')) limits.push('recordQualia ≠ phenomenal access or consciousness');
  if (domain === 'time-space' && id.includes('identity')) limits.push('Fork/merge scenarios not resolved by memory continuity alone');
  if (domain === 'causality' && id.includes('determinism')) limits.push('Outcome equality ≠ causal determinism');
  if (domain === 'epistemology' && id.includes('evidenceScore')) limits.push('Single score flattens distinct evidence types');
  if (domain === 'normative-ethics' && id.includes('consequentialism')) limits.push('Consequence > 0 → permissible is incomplete without alternatives/horizon/distribution');
  if (domain === 'philosophical-traditions') limits.push('Tradition reduced to monolithic stance');
  return limits;
};

// Helper: derive historical confidence from status and role
const deriveConfidence = (status, role) => {
  const base = { implemented: 0.8, partial: 0.5, conceptual_only: 0.3, planned: 0.2 }[status] || 0.5;
  const roleMult = { core: 1.0, operational: 0.9, analogy: 0.7, lens: 0.6, speculative: 0.4 }[role] || 1.0;
  return Math.round(base * roleMult * 10) / 10;
};

// Core commitments that GenOS truly assumes
const CORE_COMMITMENTS = [
  C({
    id: 'core.success-not-truth', label: 'Success does not equal truth', domain: 'epistemology',
    school: 'general', status: 'implemented', role: 'core', runtimeAuthority: true,
    falsifiable: true, scope: 'epistemic', knownLimits: ['Context-dependent interpretation'],
    historicalConfidence: 1.0, metadata: { principle: 'fallibilism' },
  }),
  C({
    id: 'core.claim-not-evidence', label: 'Claim is not evidence', domain: 'epistemology',
    school: 'general', status: 'implemented', role: 'core', runtimeAuthority: true,
    falsifiable: true, scope: 'epistemic', knownLimits: [], historicalConfidence: 1.0,
    metadata: { principle: 'evidence-algebra' },
  }),
  C({
    id: 'core.process-not-substance', label: 'Agent is versioned process, not substance', domain: 'ontology',
    school: 'whitehead', status: 'implemented', role: 'core', runtimeAuthority: true,
    falsifiable: true, scope: 'ontological', knownLimits: ['Fork/merge identity resolution'],
    historicalConfidence: 1.0, metadata: { principle: 'processual-ontology' },
  }),
];

// Operational theories — testable computational hypotheses
const OPERATIONAL_THEORIES = [
  // Causality operations
  C({ id: 'causality.determination', label: 'Determination / Causality', domain: 'causality',
    school: 'general', status: 'implemented', role: 'operational', runtimeAuthority: false,
    falsifiable: true, scope: 'causal', knownLimits: [
      'Outcome equality does not equal causal determinism',
      'Requires controlled variable isolation'
    ], historicalConfidence: 0.9,
    metadata: { testable: 'fork/replay/intervention', evidence: 'causal receipts' }),

  C({ id: 'causality.hume-regularity', label: 'Humean regularity: law and causal regularity', domain: 'causality',
    school: 'hume', status: 'implemented', role: 'operational', runtimeAuthority: false,
    falsifiable: true, scope: 'causal', knownLimits: [
      'Regularity ≠ necessary connection',
      'Problem of induction'
    ], historicalConfidence: 0.85,

    metadata: { testable: 'replay', evidence: 'causal regularity' }),

  C({ id: 'causality.counterfactuals', label: 'Counterfactuals', domain: 'causality',
    school: 'lewis', status: 'implemented', role: 'operational', runtimeAuthority: false,
    falsifiable: true, scope: 'causal', knownLimits: [
      'Depends on world similarity metric',
      'Not tautological — must use controlled fork'
    ], historicalConfidence: 0.8,

    metadata: { testable: 'fork+replay+intervention', SCM: true }),

  C({ id: 'causality.determinism-indeterminism', label: 'Determinism / Indeterminism', domain: 'causality',
    school: 'metaphysics', status: 'implemented', role: 'operational', runtimeAuthority: false,
    falsifiable: true, scope: 'causal', knownLimits: [
      'Same final outcome ≠ determinism',
      'Must trace causal paths'
    ], historicalConfidence: 0.85,

    metadata: { testable: 'replay+comparison', SCM: true }),

  // Epistemology operations
  C({ id: 'epistemology.plausibility', label: 'Plausibility / Probabilism', domain: 'epistemology',
    school: 'probabilism', status: 'partial', role: 'operational', runtimeAuthority: false,
    falsifiable: true, scope: 'epistemic', knownLimits: [
      'Probability ≠ truth',
      'Source independence not guaranteed'
    ], historicalConfidence: 0.7,

    metadata: { testable: 'bayesian-update', evidence: 'replicated' }),

  C({ id: 'epistemology.rationality-norms', label: 'Rationality and belief norms', domain: 'epistemology',
    school: 'analytic', status: 'partial', role: 'operational', runtimeAuthority: false,
    falsifiable: true, scope: 'epistemic', knownLimits: [
      'Norms are culturally contingent',
      'Idealized agent assumption'
    ], historicalConfidence: 0.65,

    metadata: { testable: 'belief-consistency-check', evidence: 'replay' }),

  // Science operations
  C({ id: 'science.confirmation', label: 'Theory of confirmation', domain: 'science',
    school: 'carnap-hempel', status: 'partial', role: 'operational', runtimeAuthority: false,
    falsifiable: true, scope: 'epistemic', knownLimits: [
      'Problem of old evidence',
      'Raven paradox'
    ], historicalConfidence: 0.7,

    metadata: { testable: 'likelihood-ratio', evidence: 'empirical' }),

  C({ id: 'science.falsification-demarcation', label: 'Falsification and demarcation', domain: 'science',
    school: 'popper', status: 'partial', role: 'operational', runtimeAuthority: false,
    falsifiable: true, scope: 'epistemic', knownLimits: [
      'Demarcation problem is unsolved',
      'Auxiliary hypotheses shield theories'
    ], historicalConfidence: 0.75,

    metadata: { testable: 'falsification-attempt', evidence: 'adversarial' }}),

  // Method operations
  C({ id: 'method.induction', label: 'Induction', domain: 'methods',
    school: 'hume', status: 'partial', role: 'operational', runtimeAuthority: false,
    falsifiable: true, scope: 'epistemic', knownLimits: [
      'Problem of induction',
      'Unjustified leap to general'
    ], historicalConfidence: 0.7,

    metadata: { testable: 'pattern-generalization', evidence: 'replicated' }),

  C({ id: 'method.deduction', label: 'Deduction and logical deduction', domain: 'methods',
    school: 'logic', status: 'partial', role: 'operational', runtimeAuthority: false,
    falsifiable: true, scope: 'epistemic', knownLimits: [
      'Soundness depends on axioms'
    ], historicalConfidence: 0.9,

    metadata: { testable: 'validity-check', evidence: 'formal' }}),

  // ... (continues with operational theories)
];

// Biomimetic analogies — natural mechanisms transferred under explicit conditions
const BIOMIMETIC_ANALOGIES = [
  C({
    id: 'biomimetic.selection-clonal', label: 'Clonal selection mechanism', domain: 'process',
    school: 'immunology', status: 'partial', role: 'analogy',
    runtimeAuthority: false, falsifiable: true, scope: 'computational',
    knownLimits: ['Immune system optimization ≠ general optimization'],
    historicalConfidence: 0.6,
    metadata: { source: 'natural immune system', computation: 'affinity maturation', caveat: 'not universally applicable' },
  }),
  C({
    id: 'biomimetic.stigmergy', label: 'Stigmergy: indirect coordination via environment', domain: 'process',
    school: 'swarm-intelligence', status: 'partial', role: 'analogy',
    runtimeAuthority: false, falsifiable: true, scope: 'computational',
    knownLimits: ['Requires shared environment medium'],
    historicalConfidence: 0.65,
    metadata: { source: 'insect colony coordination', computation: 'pheromone-mediated', caveat: 'medium-dependent' },
  }),
  C({
    id: 'biomimetic.evolutionary-search', label: 'Evolutionary search as optimization process', domain: 'science',
    school: 'darwin', status: 'partial', role: 'analogy',
    runtimeAuthority: false, falsifiable: true, scope: 'computational',
    knownLimits: ['Local optima, extinction risk, historical contingency'],
    historicalConfidence: 0.55,
    metadata: { source: 'natural evolution', computation: 'variation+selection+retention', caveat: 'Nature is not an objective function' },
  }),
  // ... more analogies
];

// Interpretive lenses — frameworks for analysis, no runtime authority
const INTERPRETIVE_LENS = [
  C({
    id: 'lens.stoicism', label: 'Stoicism: framework for analyzing what is/controlled', domain: 'schools',
    school: 'stoicism', status: 'implemented', role: 'lens', runtimeAuthority: false,
    falsifiable: false, scope: 'ethical-analysis', knownLimits: [
      'isMonist() hardcoded to true — not an evaluation, it is a lens default',
      'Reduction to "agent = Logos manifestation" strips structure'
    ], historicalConfidence: 0.4,
    metadata: { type: 'ethical-framework', purpose: 'critique-not-governance', note: 'assessments produce tradeoffs, not verdicts' },
  }),
  C({
    id: 'lens.epicureanism', label: 'Epicureanism: framework for analyzing hedonism/ataraxia', domain: 'schools',
    school: 'epicurus', status: 'implemented', role: 'lens', runtimeAuthority: false,
    falsifiable: false, scope: 'ethical-analysis', knownLimits: [
      'atomSchema creates 3 atom types (body/soul/spirit) — not Epicurus\' thesis that soul IS atoms',
      'Reduction to atomistic categories misrepresents thesis'
    ], historicalConfidence: 0.4,
    metadata: { type: 'ethical-framework', purpose: 'critique-not-governance' },
  }),
  C({
    id: 'lens.kantianism', label: 'Kantianism: framework for analyzing phenomenom/noumenon', domain: 'schools',
    school: 'kant', status: 'implemented', role: 'lens', runtimeAuthority: false,
    falsifiable: false, scope: 'epistemic-analysis', knownLimits: [
      'Phenomenon/noumenon split is interpretive',
      'Categories a priori are philosophical stipulations'
    ], historicalConfidence: 0.45,
    metadata: { type: 'epistemic-framework', purpose: 'critique-not-governance' },
  }),
  C({
    id: 'lens.deleuze', label: 'Deleuze: framework for analyzing difference/rhizome', domain: 'schools',
    school: 'deleuze', status: 'implemented', role: 'lens', runtimeAuthority: false,
    falsifiable: false, scope: 'conceptual-analysis', knownLimits: [
      'Rhizome topology is metaphor, not computational constraint',
      'Difference/repetition as operational principle is underdefined'
    ], historicalConfidence: 0.4,
    metadata: { type: 'conceptual-framework', purpose: 'critique-not-governance' },
  }),
  C({
    id: 'lens.whitehead', label: 'Whitehead: framework for analyzing process/actuality', domain: 'schools',
    school: 'whitehead', status: 'implemented', role: 'lens', runtimeAuthority: false,
    falsifiable: true, scope: 'processual-analysis', knownLimits: [
      'Actual occasions are philosophical primitives, not telemetry events',
      'Causal efficiency in Whitehead is not transferable without invariant extraction'
    ], historicalConfidence: 0.5,
    metadata: { type: 'process-framework', purpose: 'critique-not-governance' },
  }),
  // ... more lenses
];

// Speculative hypotheses — worth exploring but not GenOS truth
const SPECULATIVE_HYPOTHESES = [
  C({
    id: 'speculative.ideal-observer', label: 'Ideal observer theory of truth', domain: 'epistemology',
    school: 'contemporary', status: 'partial', role: 'speculative',
    runtimeAuthority: false, falsifiable: true, scope: 'epistemic',
    knownLimits: ['Observer independence is contested', 'Convergence not guaranteed'],
    historicalConfidence: 0.3,
    metadata: { exploration: 'value-laden observation', note: 'investigate but do not promote' },
  }),
  C({
    id: 'speculative.objective-chance', label: 'Objective chance as fundamental feature', domain: 'metaphysics',
    school: 'contemporary', status: 'partial', role: 'speculative',
    runtimeAuthority: false, falsifiable: true, scope: 'metaphysical',
    knownLimits: ['Chance may be epistemic deficiency in disguise'],
    historicalConfidence: 0.35,
    metadata: { exploration: 'quantum foundations', note: 'investigate but do not promote' },
  }),
  // ... more speculative
];

// Combine all categories
const ALL_CONCEPTS = [
  ...CORE_COMMITMENTS,
  ...OPERATIONAL_THEORIES,
  ...BIOMIMETIC_ANALOGIES,
  ...INTERPRETIVE_LENS,
  ...SPECULATIVE_HYPOTHESES,
  // Legacy concepts reclassified (those not explicitly reclassified above keep their status but get role metadata)
  ...(OLD_CORE.filter(c => !ALL_CONCEPTS.some(a => a.id === c.id)).map(c => {
    const role = classifyLegacyConcept(c);
    return C({ ...c, role, historicalConfidence: deriveConfidence(c.status, role) });
  })),
  ...AESTHETICS_DEFINITIONS,
  ...LOGIC_DEFINITIONS,
  ...MATHEMATICS_DEFINITIONS,
];

module.exports = {
  ALL_CONCEPTS,
  CORE_COMMITMENTS,
  OPERATIONAL_THEORIES,
  BIOMIMETIC_ANALOGIES,
  INTERPRETIVE_LENS,
  SPECULATIVE_HYPOTHESES,
};

// Classification function for legacy concepts not explicitly reclassified
const classifyLegacyConcept = (c) => {
  const id = c.id;
  const domain = c.domain;
  const school = c.school;

  // Core commitments
  if (['success-not-truth', 'claim-not-evidence', 'process-not-substance'].includes(id)) return 'core';

  // Operational theories (causality, epistemology, science, methods)
  if (id.startsWith('causality.') || id.startsWith('epistemology.') ||
      id.startsWith('science.') || id.startsWith('method.')) return 'operational';

  // Biomimetic analogies
  if (id.startsWith('biomimetic.') || id.startsWith('process.')) return 'analogy';

  // Interpretive lenses (philosophical schools)
  if (id.startsWith('school.') || id.startsWith('metaphysics.') ||
      id.startsWith('truth.') || id.startsWith('epistemology.')) return 'lens';

  // Everything else defaults to speculative or lens
  return 'speculative';
};