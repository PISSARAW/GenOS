'use strict';

// ─── Profils épistémologiques opérationnels (GenOS) ──────────────────────
const EPISTEMOLOGY_PROFILES = Object.freeze({
  'epistemology.falsification': ['belief', 'hypothesis.counterexample', 'present', 'Conserver un contre-exemple susceptible de rejeter l’hypothèse.'],
  'epistemology.revisability': ['belief', 'belief.revisionTrigger', 'present', 'Déclarer l’observation qui déclenchera une révision.'],
  'epistemology.evidence-algebra': ['evidence', 'evidence.typedLevels', 'multiple', 'Séparer les niveaux typés de preuve plutôt que compter les assertions.'],
  'epistemology.operational-epistemology': ['evidence', 'claim.evidenceSeparation', 'explicit', 'Séparer une affirmation d’agent de l’artefact qui la rend auditable.'],
  'epistemology.claim': ['belief', 'claim.statement', 'present', 'Identifier l’affirmation atomique et contestable.'],
  'epistemology.hypothesis': ['belief', 'hypothesis.statement', 'present', 'Déclarer l’hypothèse falsifiable à confronter aux observations.'],
  'epistemology.hypothesis-ledger': ['evidence', 'ledger.entries', 'recorded', 'Conserver l’historique des hypothèses et de leurs falsifications.'],
  'epistemology.prediction': ['belief', 'prediction.statement', 'present', 'Déclarer l’anticipation d’un résultat observable.'],
  'epistemology.counterexample': ['evidence', 'counterexample.inputs', 'recorded', 'Conserver les entrées et sorties d’un contre-exemple reproductible.'],
  'epistemology.direct-evidence': ['evidence', 'evidence.receipt', 'recorded', 'Conserver le reçu ou artefact directement associé à un claim.'],
  'epistemology.independent-evidence': ['evidence', 'evidence.sourceIndependence', 'explicit', 'Déclarer l’indépendance de la source de preuve par rapport au claimant.'],
  'epistemology.evidence-reception': ['evidence', 'evidenceReport.received', 'present', 'Constater la réception d’un rapport d’évidence dans le dossier worker.'],
  'epistemology.provenance': ['causal', 'provenance.chain', 'recorded', 'Tracer la chaîne des intrants et transformations jusqu’à leur origine.'],
  'epistemology.grounding': ['evidence', 'claim.groundingArtifact', 'present', 'Lier une affirmation symbolique à l’observation ou artefact qui la rattache au monde opérationnel.'],
  'epistemology.epistemic-state': ['belief', 'claim.epistemicState', 'present', 'Représenter l’état épistémique : qualité de preuve, phase, dette.'],
  'epistemology.formal-result': ['evidence', 'result.deterministicReceipt', 'recorded', 'Conserver le reçu d’un résultat déterministe vérifiable.'],
  'epistemology.unverified-result': ['evidence', 'result.provisionalStatus', 'present', 'Marquer un résultat comme provisoire avec dette épistémique explicite.'],
  'epistemology.promotion-eligible': ['policy', 'promotion.decision', 'explicit', 'Enregistrer la décision de la gate de promotion (éligible / non éligible).'],
  'epistemology.belief-revision': ['belief', 'belief.revisionTrigger', 'present', 'Déclarer l’observation qui déclenche une révision de croyance.'],
  'epistemology.dissonance': ['belief', 'belief.contradictionCount', 'zero', 'Signaler l’absence de contradiction entre beliefs et evidence.'],
  'epistemology.bias': ['interpretation', 'bias.auditResult', 'present', 'Conserver le résultat de l’audit des biais de steering et de surconfiance.'],
  'epistemology.hallucination': ['evidence', 'hallucination.signal', 'present', 'Constater un signal de claim non prouvé ou de placeholder.'],
  'epistemology.hallucination-monitoring': ['evidence', 'monitoring.signalCount', 'recorded', 'Conserver les compteurs de signalement des claims non prouvés.'],
  'epistemology.brier-score': ['belief', 'brier.calibrationScore', 'probability', 'Borner le score de calibration Brier entre 0 et 1.'],
  'epistemology.weighted-consensus': ['relations', 'consensus.sources', 'multiple', 'Conserver les sources distribuées contribuant à un consensus pondéré.'],
  'epistemology.quorum-abstention': ['policy', 'abstention.rule', 'explicit', 'Déclarer la règle d’abstention et le plancher de confiance.'],
  'epistemology.evidence-barrier': ['evidence', 'barrier.validatedClaims', 'recorded', 'Conserver les claims validés par la barrière d’évidence.'],
  'epistemology.promotion-gate': ['policy', 'promotion.policyCompliance', 'recorded', 'Conserver les politiques du contrat et leur statut de satisfaction.'],
  'epistemology.metric-experience-boundary': ['belief', 'experience.metricLimit', 'present', 'Borner l’usage des métriques à l’expérience déclarée sans conclure à une expérience subjective.'],
});

module.exports = { EPISTEMOLOGY_PROFILES };
