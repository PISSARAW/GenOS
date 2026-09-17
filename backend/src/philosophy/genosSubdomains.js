'use strict';

const GENOS_SUBDOMAINS = Object.freeze([
  'ontology',
  'consciousness',
  'cognition',
  'phenomenology',
  'identity',
  'social-cognition',
  'wellbeing',
  'computation',
  'prediction',
  'epistemics',
  'ethics',
  'causality',
  'process'
]);

const GENOS_SUBDOMAINS_BY_CONCEPT = Object.freeze({
  'ontology.being': ['ontology'],
  'ontology.identity-change': ['ontology', 'identity'],
  'ontology.person-other': ['ontology', 'social-cognition'],
  'ontology.stances': ['ontology', 'epistemics'],
  'metaphysics.dualism': ['ontology', 'consciousness'],
  'metaphysics.material-monism': ['ontology', 'consciousness'],
  'metaphysics.emergence': ['ontology', 'consciousness', 'cognition'],
  'metaphysics.supervenience': ['ontology', 'consciousness'],
  'metaphysics.mind-body': ['consciousness', 'ontology'],
  'metaphysics.qualia': ['consciousness', 'phenomenology', 'wellbeing'],
  'metaphysics.reference-intentionality': ['consciousness', 'cognition', 'phenomenology'],
  'causality.counterfactuals': ['causality', 'computation'],
  'process.heidegger-dasein': ['phenomenology', 'identity'],
  'school.merleau-ponty': ['phenomenology', 'cognition'],
  'school.sartre': ['phenomenology', 'consciousness'],
  'school.heidegger': ['phenomenology', 'identity']
});

function subdomainsForConcept(concept) {
  return concept.genosDomains || GENOS_SUBDOMAINS_BY_CONCEPT[concept.id] || [];
}

module.exports = {
  GENOS_SUBDOMAINS,
  GENOS_SUBDOMAINS_BY_CONCEPT,
  subdomainsForConcept
};
