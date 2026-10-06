'use strict';

const { profileFor } = require('./operationalProfiles');
const { predicateNames } = require('./operationalPredicates');
const { relationsFor } = require('./operationalRelations');

const PRIMITIVES = Object.freeze({
  self: { targets: ['agent', 'reflection'], category: 'state', mechanism: 'FunctionalSelfModel' },
  world: { targets: ['world', 'reflection'], category: 'state', mechanism: 'WorldObservationModel' },
  belief: { targets: ['world', 'reflection', 'response'], category: 'evaluation', mechanism: 'BeliefCheckScheduler' },
  evidence: { targets: ['world', 'reflection', 'response'], category: 'constraint', mechanism: 'EvidenceBoundary' },
  causal: { targets: ['world', 'reflection'], category: 'transformation', mechanism: 'InterventionComparator' },
  relations: { targets: ['relations', 'reflection'], category: 'organization', mechanism: 'AccountabilityModel' },
  topology: { targets: ['topology', 'relations'], category: 'organization', mechanism: 'TopologyAudit' },
  policy: { targets: ['relations', 'response', 'reflection'], category: 'constraint', mechanism: 'NormativeAudit' },
  creative: { targets: ['response', 'reflection'], category: 'evaluation', mechanism: 'CreativeCriteriaPlanner' },
  interpretation: { targets: ['world', 'response', 'reflection'], category: 'evaluation', mechanism: 'SituatedInterpretation' },
  logic: { targets: ['world', 'reflection', 'response'], category: 'evaluation', mechanism: 'DeclaredLogicAudit' },
});

function operationalize(base, concept) {
  const profile = profileFor(concept.id);
  if (!profile) return { ...base, compilationState: 'unmapped', maturity: 'defined' };
  const primitive = PRIMITIVES[profile.primitive];
  const execution = { apiVersion: 'genos.philosophy-execution/v1', ...profile };
  const relations = relationsFor(concept.id);
  return {
    ...base, category: primitive.category, targets: primitive.targets,
    operationalRelations: relations,
    conflicts: [...new Set([...base.conflicts, ...relations.tensionsWith])],
    distinctions: [...base.distinctions, ...relations.distinguishedFrom.map((id) => `Interprétation distincte : ${id}`)],
    interpretation: profile.interpretation, mechanism: primitive.mechanism, execution,
    mechanismEvidence: 'executable-bounded-audit', compilationState: 'executable-audit',
    maturity: 'mechanism-linked', runtimeAuthority: false, externalFactsVerified: false,
    invariant: `${base.invariant} Audit borné : ${profile.field} doit satisfaire ${profile.predicate}.`,
    observables: [profile.field, 'verification_tasks', 'violation_count', 'response_caveats'],
    falsificationTests: [...base.falsificationTests,
      `Comparer un cas satisfaisant et un contre-exemple de ${profile.predicate} sur ${profile.field}.`,
      `Retirer ${profile.field} : produire une tâche de vérification, jamais un succès.`,
      'Désactiver le mécanisme : comparer les tâches, le verdict et les réserves de réponse.',
    ],
    limits: [...base.limits, 'Ce mécanisme audite des observations déclarées ; il ne vérifie pas leur vérité externe.',
      'Il ne remplace pas un solveur logique, une politique autorisée ni une validation sur missions réelles.'],
    prohibitions: [...base.prohibitions, 'confondre un audit logiciel réussi avec la vérité de la théorie ou des observations',
      'utiliser ce contrat pour étendre une permission, un lease ou un périmètre de mutation'],
    responsibility: 'Le producteur fournit les observations et leurs sources ; le vérificateur rejoue le calcul borné.',
    sourceRefs: [...new Set([...base.sourceRefs, 'backend/src/philosophy/operationalProfiles.js',
      'backend/src/philosophy/conceptDefinitions.js'])],
    sourceStatus: 'repository-interpretation-not-scholarly-verification',
  };
}

function executionErrors(contract) {
  const profile = profileFor(contract.id);
  if (!profile) return [`no executable interpretation for ${contract.id}`];
  if (!PRIMITIVES[profile.primitive]) return ['unknown primitive'];
  if (!predicateNames.includes(profile.predicate)) return ['unknown operational predicate'];
  const execution = contract.execution;
  if (!execution) return ['executable interpretation required'];
  if (execution.apiVersion !== 'genos.philosophy-execution/v1') return ['unsupported execution.apiVersion'];
  return ['primitive', 'field', 'predicate', 'interpretation']
    .filter((key) => execution[key] !== profile[key]).map((key) => `execution.${key} differs from registry`);
}

module.exports = { operationalize, executionErrors, PRIMITIVES };
