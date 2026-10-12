'use strict';

const values = require('../trinityProvenanceValues');
const provenance = require('../gvxMissionProvenance');
const store = require('../biologicalWorkerStore');
const { MAX_AGE_MS } = require('./oracleProcedureSubject');

const METHODS = Object.freeze({
  scan_literal: { workerKind: 'scout_cell', artifact: 'scout_observation', domain: 'literal_observation' },
  monitor_samples: { workerKind: 'resident_daemon', artifact: 'dossier', domain: 'monitor_window' },
  synthesize_claims: { workerKind: 'synthesis_worker', artifact: 'synthesis_dossier', domain: 'claim_synthesis' },
  trace_declared_causes: { workerKind: 'forensic_worker', artifact: 'causal_dossier', domain: 'declared_causality' },
  measure_lpt: { workerKind: 'experimental_worker', artifact: 'experiment_record', domain: 'lpt_experiment' },
  verify_procedure: { workerKind: 'verifier_worker', artifact: 'verification_report', domain: 'procedure_verification' },
  falsify_procedure: { workerKind: 'red_worker', artifact: 'verification_report', domain: 'procedure_falsification' },
  teach_subset_sum: { workerKind: 'teaching_worker', artifact: 'training_packet', domain: 'subset_sum_teaching' },
  formal_proof: { workerKind: 'formal_worker', artifact: 'formal_certificate', domain: 'formal_theorem' },
  restore_checkpoint: { workerKind: 'recovery_worker', artifact: 'dossier', domain: 'checkpoint_recovery' },
  prepare_handoff: { workerKind: 'liaison_worker', artifact: 'dossier', domain: 'sourced_handoff' },
  coordinate_children: { workerKind: 'sub_orchestrator', artifact: 'dossier', domain: 'child_coordination' },
  adapt_procedure: { workerKind: 'adaptive_worker', artifact: 'dossier', domain: 'adaptive_strategy' },
  niche_procedure: { workerKind: 'specialist', artifact: 'dossier', domain: 'niche_procedure' },
  host_procedure: { workerKind: 'symbiotic_worker', artifact: 'dossier', domain: 'host_procedure' },
  combine_candidates: { workerKind: 'creative_worker', artifact: 'creative_candidate', domain: 'creative_combination' },
  review_synthetic_case: { workerKind: 'medical_worker', artifact: 'clinical_report', domain: 'synthetic_case_review' }
});

async function load(db, request) {
  assertRequest(db, request);
  const runBinding = await provenance.readRun(db, { runId: request.runId, scope: request.scope });
  const binding = await store.binding(db, request.runId);
  if (!runBinding || binding?.workerId !== request.agentId
    || request.scope.entityId !== request.agentId) throw values.failure('ORACLE_RUNTIME_SUBJECT_MISMATCH');
  const method = binding.genome.workerContract?.mission?.methodContract;
  const descriptor = descriptorFor(method, binding.genome.workerContract?.identity?.workerKind);
  const observed = freshObservation(await store.observations(db, request.runId));
  const report = observed.event.payload?.evidenceReport;
  const artifact = report?.workerArtifact;
  if (artifact?.type !== descriptor.artifact || !artifact.content) {
    throw values.failure('ORACLE_RESULT_OBSERVATION_REQUIRED');
  }
  const result = descriptor.domain === 'child_coordination'
    ? await coordinatedResult({ db, request, method, content: artifact.content, binding }) : artifact.content;
  return { domain: descriptor.domain, runId: request.runId, workerId: request.agentId,
    leanExecutable: process.env.GENOS_LEAN_EXECUTABLE || 'lean',
    method, result, workerContract: structuredContract(binding.genome.workerContract),
    artifactRefs: artifact.provenance?.sourceRefs || [], workspaceRoot: binding.genome.workerContract?.mission?.scope,
    observationHash: observed.hash,
    observedAt: observed.event.timestamp, runBindingHash: runBinding.hash,
    bindingHash: values.digest(binding),
    validUntil: new Date(Date.parse(observed.event.timestamp) + MAX_AGE_MS).toISOString() };
}

function structuredContract(contract) {
  return { specialtyNiche: contract?.mission?.specialtyNiche || null,
    hostContractId: contract?.mission?.hostContractId || null,
    hostCapabilities: contract?.mission?.hostCapabilities || [] };
}

async function coordinatedResult(input) {
  const { db, request, method, content, binding } = input;
  const children = await require('./oracleCoordinationSubject').load({ db, parentId: request.agentId,
    missionId: binding.missionId, method, result: content });
  return { ...content, coordinationEvidence: children };
}

function assertRequest(db, request) {
  if (!db || !request?.runId || !request.agentId || !request.scope) {
    throw values.failure('ORACLE_RUNTIME_SUBJECT_REQUIRED');
  }
}

function descriptorFor(method, workerKind) {
  const descriptor = METHODS[method?.methodId];
  if (method?.version !== 1 || !descriptor || descriptor.workerKind !== workerKind) {
    throw values.failure('ORACLE_DOMAIN_UNAVAILABLE');
  }
  return descriptor;
}

function freshObservation(records) {
  const observed = records.filter(item => item.applied && item.event.eventType === 'EVIDENCE_REPORT').at(-1);
  const age = Date.now() - Date.parse(observed?.event.timestamp);
  if (!observed || !Number.isFinite(age) || age < -60000 || age > MAX_AGE_MS) {
    throw values.failure('ORACLE_SOURCE_STALE');
  }
  return observed;
}

function assertAntigen(antigen, subject) {
  const spec = SPECS[subject?.domain];
  const formal = require('../formalResultService').createFormalResult(antigen?.formalResult);
  if (!spec || formal.canonicalStatement !== spec.statement || antigen.claim !== spec.statement
    || formal.resultId !== antigen.id || formal.evidence.digest !== antigen.epitopes?.evidence?.digest) {
    throw values.failure('ORACLE_CLAIM_BINDING_MISMATCH');
  }
  if (values.digest(formal.evidence.content) !== values.digest({ method: subject.method, result: subject.result })
    || values.digest(formal.validityDomain) !== values.digest({ ...spec.domain,
      constraints: [...spec.domain.constraints].sort() })) {
    throw values.failure('ORACLE_SEMANTIC_SUBJECT_MISMATCH');
  }
}

function forDomain(domain) {
  const spec = SPECS[domain];
  if (!spec) throw values.failure('ORACLE_DOMAIN_UNAVAILABLE');
  return { load, assertAntigen, DOMAIN: spec.domain };
}

const SPECS = Object.freeze({
  literal_observation: { statement: 'Les correspondances littérales observées correspondent aux sources et termes scellés.',
    domain: { statement: 'Scan littéral déterministe de sources bornées.',
      constraints: ['Le texte et les termes sont ceux du contrat scellé.',
        'L’authenticité des sources et leur interprétation sémantique ne sont pas évaluées.'] } },
  monitor_window: { statement: 'Les anomalies du daemon correspondent au seuil et aux échantillons scellés.',
    domain: { statement: 'Comparaison numérique d’une fenêtre d’échantillons bornée.',
      constraints: ['Une anomalie est une valeur strictement supérieure au seuil.',
        'La provenance et la justesse des échantillons ne sont pas évaluées.'] } },
  claim_synthesis: { statement: 'La synthèse conserve les sources et signale les désaccords de revendications identiques.',
    domain: { statement: 'Regroupement déterministe de positions textuelles attribuées.',
      constraints: ['Les sources et positions proviennent du contrat scellé.',
        'La vérité des revendications et la qualité des sources ne sont pas évaluées.'] } },
  declared_causality: { statement: 'La trace forensique reproduit les liens de causalité déclarés dans les événements scellés.',
    domain: { statement: 'Projection de relations causales explicitement fournies.',
      constraints: ['Chaque relation cite un événement antérieur et un reçu déclaré.',
        'La vérité causale indépendante n’est pas évaluée.'] } },
  lpt_experiment: { statement: 'La mesure expérimentale rapporte le makespan LPT calculé pour les tâches scellées.',
    domain: { statement: 'Ordonnancement LPT déterministe de tâches entières bornées.',
      constraints: ['La mesure porte uniquement sur les tâches et machines déclarées.',
        'Aucune garantie d’optimalité globale n’est inférée.'] } },
  procedure_verification: { statement: 'Le verdict du vérificateur correspond à la comparaison du reçu soumis avec le résultat recalculé.',
    domain: { statement: 'Vérification déterministe d’un reçu subset_sum borné.',
      constraints: ['Les entrées et le reçu candidat proviennent du contrat scellé.',
        'La preuve est limitée aux postconditions subset_sum recalculées.'] } },
  procedure_falsification: { statement: 'Le contre-exemple rouge reproduit la divergence entre le reçu soumis et le résultat subset_sum recalculé.',
    domain: { statement: 'Falsification déterministe d’un reçu subset_sum borné.',
      constraints: ['Les entrées et le reçu candidat proviennent du contrat scellé.',
        'Aucune conclusion ne s’étend au-delà de cette divergence.'] } },
  subset_sum_teaching: { statement: 'La démonstration et le transfert du paquet pédagogique respectent les postconditions subset_sum.',
    domain: { statement: 'Pédagogie bornée vérifiée par témoin subset_sum.',
      constraints: ['Le transfert est un ensemble d’indices distincts dont la somme atteint la cible.',
        'La qualité pédagogique générale n’est pas évaluée.'] } },
  formal_theorem: { statement: 'Lean certifie la proposition arithmétique scellée sans axiomes supplémentaires.',
    domain: { statement: 'Vérification Lean d’une comparaison arithmétique fermée sur les naturels.',
      constraints: ['La source Lean est reconstruite depuis la proposition du contrat.',
        'La confiance repose sur le noyau et le toolchain Lean déclarés.'] } },
  checkpoint_recovery: { statement: 'Le checkpoint restauré correspond au contenu scellé et au reçu de la tentative.',
    domain: { statement: 'Restauration d’un fichier borné, confiné à l’espace de travail scellé.',
      constraints: ['Le chemin est relatif et reste dans le scope du contrat.',
        'Le contenu final est comparé au digest du checkpoint et le reçu est recalculé.'] } },
  sourced_handoff: { statement: 'Le dossier de passation conserve les groupes et références scellés sans prétendre à un accusé du destinataire.',
    domain: { statement: 'Projection déterministe d’une passation sourcée vers le dossier parent.',
      constraints: ['Les références viennent des éléments de passation du contrat.',
        'La livraison au destinataire et son accusé ne sont pas attestés.'] } },
  child_coordination: { statement: 'Les enfants délégués ont terminé le run courant avec leurs contrats et dossiers vérifiables.',
    domain: { statement: 'Vérification bornée de délégations persistées vers des workers enfants.',
      constraints: ['Chaque enfant appartient au sous-orchestrateur et à sa mission courante.',
        'Le run terminé, son événement terminal et son dossier de preuve sont liés.',
        'La qualité sémantique générale du travail enfant n’est pas déduite.'] } },
  adaptive_strategy: { statement: 'Les essais adaptatifs reproduisent les mesures LPT et le meilleur résultat observé.',
    domain: { statement: 'Comparaison bornée d’essais LPT sur un problème scellé.',
      constraints: ['Les entrées des essais sont identiques et chaque reçu est recalculé.',
        'Le meilleur résultat observé ne prouve pas une optimalité globale.'] } },
  niche_procedure: { statement: 'La procédure du spécialiste respecte la niche assignée et son reçu subset_sum est valide.',
    domain: { statement: 'Exécution bornée d’une procédure dans une niche déclarée.',
      constraints: ['La niche doit correspondre au contrat persistant.',
        'La vérité externe de la niche n’est pas évaluée.'] } },
  host_procedure: { statement: 'La procédure symbiotique respecte la capacité accordée par son hôte.',
    domain: { statement: 'Exécution bornée d’une procédure autorisée par un contrat hôte.',
      constraints: ['La capacité et le contrat hôte proviennent du binding persistant.',
        'Aucune qualité biologique ou relationnelle n’est inférée.'] } },
  creative_combination: { statement: 'Les combinaisons créatives suivent les dimensions et l’ordre scellés.',
    domain: { statement: 'Énumération déterministe de combinaisons de conception bornées.',
      constraints: ['Les alternatives sont les produits cartésiens des options fournies.',
        'La nouveauté et la qualité créative ne sont pas évaluées.'] } },
  synthetic_case_review: { statement: 'Le rapport médical reprend les considérations et références du cas synthétique scellé.',
    domain: { statement: 'Projection d’un cas synthétique à visée éducative.',
      constraints: ['Les considérations et leurs références sont celles du contrat.',
        'Aucune validation clinique, aucun diagnostic et aucun traitement ne sont produits.'] } }
});

module.exports = { load, assertAntigen, forDomain, SPECS };
