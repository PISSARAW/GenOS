'use strict';

/**
 * Typed Evidence Algebra — épistémologie GenOS avec types de preuves distincts.
 *
 * L'évidence n'est pas une quantité homogène. Différentes formes de preuve
 * ont différentes propriétés :
 *
 *  - observational : source_reliability, recency, scope
 *  - experimental : reproducibility, causal_relevance, coverage
 *  - formal : proof, falsifiability, mathematical certainty
 *  - causal : intervention-documented, causal_graph, SCM
 *  - testimonial : author_authority, independence, conflict_of_interest
 *  - replicated : independent_replication, same_result_consistency
 *  - adversarial : challenge_success_rate, falsification_record
 *  - human_authoritative : domain_expertise, peer_verification, track_record
 *
 * Propriétés clés :
 *  - independence : deux preuves du même LLM ne sont pas deux preuves indépendantes
 *  - source_reliability : une source fiable peut produire des preuves non reproductibles
 *  - causal_relevance : une preuve formelle peut être non pertinente causalement
 *
 * Ce service produit des evidence profiles structurés, pas des scores.
 */

const EVIDENCE_TYPES = Object.freeze([
  'observational',
  'experimental',
  'formal',
  'causal',
  'testimonial',
  'replicated',
  'adversarial',
  'human_authoritative',
]);

const PROPERTIES_BY_TYPE = Object.freeze({
  observational: ['source_reliability', 'recency', 'scope'],
  experimental: ['reproducibility', 'causal_relevance', 'coverage'],
  formal: ['proof', 'falsifiability', 'mathematical_certainty'],
  causal: ['intervention_documented', 'causal_graph', 'scm'],
  testimonial: ['author_authority', 'independence', 'conflict_of_interest'],
  replicated: ['independent_replication', 'same_result_consistency'],
  adversarial: ['challenge_success_rate', 'falsification_record'],
  human_authoritative: ['domain_expertise', 'peer_verification', 'track_record'],
});

function createEvidenceProfile({ type, source, properties = {}, independence = null }) {
  if (!EVIDENCE_TYPES.includes(type)) {
    throw new Error(`typedEvidenceAlgebra.createEvidenceProfile: unknown type "${type}"`);
  }

  return {
    type,
    source,
    properties,
    independence,
    knownLimits: [
      `Type '${type}' has properties: ${PROPERTIES_BY_TYPE[type].join(', ')}`,
      'Independence from other evidence must be explicitly established',
      'This profile does not establish truth, only documents the form of evidence',
    ],
    executable: false,
    runtimeAuthority: false,
  };
}

/**
 * assessIndependence — évalue si deux preuves sont indépendantes.
 *
 * Deux preuves issues du même LLM ne sont pas deux preuves indépendantes.
 * Deux preuves issues de sources différentes avec des méthodes différentes
 * peuvent être indépendantes.
 */
function assessIndependence(evidenceA, evidenceB) {
  if (!evidenceA || !evidenceB) {
    throw new Error('typedEvidenceAlgebra.assessIndependence requires two evidence profiles');
  }

  const sameSource = evidenceA.source === evidenceB.source;
  const sameType = evidenceA.type === evidenceB.type;
  const sameMethod = (evidenceA.properties.method || null) === (evidenceB.properties.method || null);

  // Si même source, même type, même méthode → non indépendant
  if (sameSource && sameType && sameMethod) {
    return {
      independent: false,
      reason: 'Same source, type, and method — evidence is not independent',
      caveat: 'Two outputs from the same LLM with the same method are not independent proofs',
    };
  }

  // Si même source mais méthodes différentes → partiellement indépendant
  if (sameSource && !sameMethod) {
    return {
      independent: 'partial',
      reason: 'Same source but different methods — partial independence',
      caveat: 'Same LLM with different methods may share systematic biases',
    };
  }

  // Si sources différentes → degré d'indépendance à établir
  // Deux sources différentes ne suffisent pas : elles peuvent partager la
  // même base de données, le même modèle, les mêmes prémisses, ou le même
  // environnement d'exécution. On retourne un statut de dépendance, pas un
  // verdict d'indépendance.
  return {
    dependencyStatus: 'unknown',
    reason: 'Different sources — independence not yet established',
    caveat: 'Different sources do not guarantee independence. Shared upstream dependencies (datasets, model families, retrievers, execution environment, premises) must be explicitly ruled out.',
    upstreamConsiderations: [
      'shared dataset IDs',
      'shared model family / training data',
      'shared retriever or index',
      'shared execution environment',
      'shared premises or axioms',
    ],
  };
}

/**
 * compareEvidenceStrength — comparaire la force de deux preuves.
 *
 * Attention : la force n'est pas une quantité totale. Une preuve formelle
 * irréfutable et une preuve causale interventionnelle ne sont pas comparables
 * directement. On produit un comparatif structuré, pas un classement.
 */
function compareEvidenceStrength(evidenceA, evidenceB) {
  if (!evidenceA || !evidenceB) {
    throw new Error('typedEvidenceAlgebra.compareEvidenceStrength requires two evidence profiles');
  }

  if (evidenceA.type === evidenceB.type) {
    return {
      comparable: true,
      type: evidenceA.type,
      assessment: {
        type: 'same-type-comparison',
        note: `Both evidence profiles are of type '${evidenceA.type}'. Compare by properties: ${PROPERTIES_BY_TYPE[evidenceA.type].join(', ')}.`,
      },
    };
  }

  return {
    comparable: false,
    typeA: evidenceA.type,
    typeB: evidenceB.type,
    assessment: {
      type: 'cross-type-incommensurable',
      note: `Evidence of type '${evidenceA.type}' and '${evidenceB.type}' are not directly comparable. They answer different epistemic questions.`,
      evidenceAProperties: PROPERTIES_BY_TYPE[evidenceA.type],
      evidenceBProperties: PROPERTIES_BY_TYPE[evidenceB.type],
    },
  };
}

/**
 * evidenceReport — produit un rapport d'évidence typé.
 *
 * Remplace evidenceScore() par un profil structuré avec dépendances.
 */
function evidenceReport({ claims = [], evidence = [], dependencies = [] } = {}) {
  const typedEvidence = evidence.map((e) => {
    if (e.type) return e;
    return createEvidenceProfile({
      type: 'observational',
      source: e.source || 'unknown',
      properties: e.properties || {},
    });
  });

  const independenceMap = [];
  for (let i = 0; i < typedEvidence.length; i++) {
    for (let j = i + 1; j < typedEvidence.length; j++) {
      independenceMap.push({
        a: typedEvidence[i].source,
        b: typedEvidence[j].source,
        independence: assessIndependence(typedEvidence[i], typedEvidence[j]),
      });
    }
  }

  return {
    claims,
    evidence: typedEvidence,
    dependencies,
    independenceMap,
    assessment: {
      type: 'typed-evidence-report',
      evidenceCount: typedEvidence.length,
      distinctTypes: [...new Set(typedEvidence.map((e) => e.type))],
      independencePairs: independenceMap.length,
      note: 'Evidence is typed and dependency relationships have been assessed; independence is only established where explicitly demonstrated.',
    },
    executable: false,
    runtimeAuthority: false,
  };
}

module.exports = {
  EVIDENCE_TYPES,
  PROPERTIES_BY_TYPE,
  createEvidenceProfile,
  assessIndependence,
  compareEvidenceStrength,
  evidenceReport,
};
