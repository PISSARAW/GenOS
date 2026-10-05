'use strict';

const crypto = require('node:crypto');
const { validateSpec } = require('../services/specValidator');

/**
 * Operational contracts are the executable boundary between a philosophical
 * registry entry and GenOS behaviour. A contract is a testable proposal, not
 * proof that the philosophical position is true.
 */

const TARGETS = Object.freeze([
  'agent', 'relations', 'topology', 'world', 'reflection', 'response',
]);
const MATURITY = Object.freeze([
  'registered', 'defined', 'mechanism-linked', 'observable', 'tested',
  'integrated', 'validated',
]);
const EVIDENCE_FOR_MATURITY = Object.freeze({
  observable: ['observation-receipt'],
  tested: ['scenario-receipt'],
  integrated: ['scenario-receipt', 'runtime-receipt'],
  validated: ['scenario-receipt', 'runtime-receipt', 'independent-receipt'],
});

function contract(id, ...values) {
  const [type, interpretation, invariant, mechanism, targets, observables, tests, limits, conflicts = []] = values;
  return {
    apiVersion: 'genos.contract/v1',
    kind: 'ImplementationContract',
    id,
    type,
    interpretation,
    targets,
    invariant,
    mechanism,
    observables,
    falsificationTests: tests,
    limits,
    conflicts,
    permissions: [],
    obligations: ['conserver la provenance des observations et des décisions'],
    prohibitions: ['convertir une analogie en autorisation runtime'],
    violationCriteria: ['une décision modifie le comportement sans observation traçable'],
    responsibility: 'Le producteur de la décision conserve la justification et le résultat observé.',
    maturity: 'tested',
    status: 'candidate',
  };
}

const PILOT_CONTRACTS = Object.freeze([
  contract('truth.pragmatist', 'concept', 'Une croyance gagne en fiabilité si elle résiste à des tests indépendants et améliore les prédictions.', 'Ne pas augmenter la confiance sans nouvelle preuve.', 'belief_revision', ['world', 'reflection', 'response'], ['prediction_accuracy', 'confidence_delta', 'correction_delay'], ['injecter une contradiction fiable et vérifier la révision'], ['La réussite pratique ne prouve pas une vérité métaphysique.'], ['truth.correspondence']),
  contract('epistemology.certainty-doubt', 'concept', 'Une incertitude pertinente déclenche une vérification ou une réponse calibrée.', 'Une incertitude forte sur une affirmation importante doit rester visible.', 'uncertainty_monitor', ['world', 'reflection', 'response'], ['uncertainty_visibility', 'useful_verifications', 'uncorrected_errors'], ['fournir deux sources contradictoires et mesurer la calibration'], ['Le doute systématique peut empêcher d agir.'], ['epistemology.justification']),
  contract('epistemology.justification', 'concept', 'Une affirmation importante doit conserver les raisons et sources qui la soutiennent.', 'Aucune confiance élevée sans justification inspectable.', 'evidence_registry', ['world', 'reflection', 'response'], ['evidence_coverage', 'unsupported_claims', 'provenance_completeness'], ['supprimer la source principale et vérifier le déclassement'], ['Une justification cohérente peut rester fausse.']),
  contract('causality.counterfactuals', 'concept', 'Une cause est testée par une variation contrôlée et une différence de résultat.', 'Ne pas confondre succession temporelle et dépendance causale.', 'counterfactual_brancher', ['world', 'reflection'], ['effect_delta', 'branch_reproducibility', 'confounders'], ['rejouer avec et sans intervention sur la variable'], ['Les contrefactuels dépendent du modèle et de ses variables.']),
  contract('core.lineage', 'notion', 'Une lignée conserve la continuité historique des versions et forks.', 'Toute décision doit être rattachable à une version et un parent.', 'lineage_tracker', ['agent', 'reflection'], ['lineage_completeness', 'orphan_decisions', 'fork_count'], ['créer un fork puis rechercher la décision dans les deux lignées'], ['La continuité fonctionnelle ne démontre pas une identité personnelle.']),
  contract('ontology.identity-change', 'concept', 'Une identité runtime est suivie par invariants, transitions et provenance.', 'Une transition d identité doit être explicitement classifiée.', 'identity_continuity_tracker', ['agent', 'world'], ['transition_classification', 'identity_conflicts', 'provenance_completeness'], ['modifier un invariant et vérifier la détection de rupture'], ['Le modèle ne capture pas une identité substantielle.']),
  contract('metaphysics.reference-intentionality', 'notion', 'Une sortie est analysée selon l objet visé et non seulement sa forme textuelle.', 'Toute interprétation d intention doit exposer son contexte et son incertitude.', 'intent_model', ['agent', 'response'], ['intent_confidence', 'context_coverage', 'misread_rate'], ['présenter deux intentions compatibles avec le même énoncé'], ['Une intention subjective ne peut pas être inférée avec certitude.']),
  contract('ethics.responsibility-other', 'norm', 'Une décision conserve son auteur, ses obligations et ses conséquences envers autrui.', 'Une responsabilité ne peut pas être effacée par une délégation technique.', 'accountability_ledger', ['agent', 'relations', 'reflection'], ['attribution_completeness', 'unresolved_obligations', 'harm_traceability'], ['déléguer une action puis auditer la chaîne de responsabilité'], ['La traçabilité ne résout pas à elle seule un conflit moral.']),
  contract('ethics.distributive-justice', 'norm', 'Une répartition expose les critères, bénéficiaires et coûts supportés.', 'Toute allocation doit être explicable par des critères déclarés.', 'allocation_auditor', ['relations', 'topology', 'response'], ['allocation_coverage', 'cost_asymmetry', 'criteria_visibility'], ['modifier les critères et comparer les bénéficiaires'], ['Aucune théorie de justice n est présumée universelle.']),
  contract('politics.separation-of-powers', 'norm', 'Le contrôle du routage, de la proposition et de la décision doit être séparable.', 'Un agent ne doit pas cumuler silencieusement proposition, arbitrage et audit.', 'authority_graph', ['relations', 'topology'], ['authority_concentration', 'audit_independence', 'override_count'], ['concentrer les rôles et vérifier l alerte de gouvernance'], ['La séparation augmente parfois la latence.']),
  contract('politics.social-contract', 'theory', 'Les règles de coordination sont explicites, acceptées dans le périmètre et révisables.', 'Une obligation collective doit avoir un sujet, une portée et une procédure de sortie.', 'commitment_protocol', ['relations', 'topology'], ['commitment_coverage', 'consent_rate', 'violations'], ['introduire une règle ambiguë et vérifier le refus de promotion'], ['Le consentement simulé ne vaut pas consentement humain.']),
  contract('school.deleuze', 'lens', 'La diversité des chemins et des points d entrée est évaluée comme propriété de topologie.', 'Une architecture alternative doit pouvoir être comparée sans être appelée rhizomatique par analogie seule.', 'topology_graph', ['topology', 'relations'], ['alternative_paths', 'routing_resilience', 'coordination_cost'], ['comparer diffusion, fédération et pair à pair sur la même mission'], ['La métaphore rhizomatique ne définit pas un algorithme unique.']),
  contract('core.success-not-truth', 'constraint', 'Un transport ou une sortie réussie ne vaut pas preuve de validité.', 'La promotion exige une preuve indépendante du succès du transport.', 'evidence_gate', ['world', 'reflection', 'response'], ['promotion_rejections', 'independent_evidence', 'false_successes'], ['retourner un succès sans artefact et vérifier le rejet'], ['Le gate ne produit pas la preuve manquante.']),
  contract('logic.paraconsistent', 'method', 'Des contradictions locales peuvent être conservées sans explosion logique.', 'Une contradiction doit être signalée sans autoriser une conclusion arbitraire.', 'contradiction_detector', ['world', 'reflection'], ['contradiction_count', 'explosion_prevention', 'resolution_delay'], ['injecter P et non-P puis vérifier les conclusions bornées'], ['La tolérance aux contradictions peut retarder une décision.']),
  contract('method.intervention-replay', 'method', 'Une hypothèse causale est comparée par replay d une intervention bornée.', 'Un replay doit conserver les conditions et l artefact de comparaison.', 'causal_replay', ['world', 'reflection'], ['replay_fidelity', 'condition_drift', 'effect_delta'], ['rejouer deux fois avec le même seed et comparer les reçus'], ['Un replay fidèle ne garantit pas un modèle causal complet.']),
  contract('epistemology.knowledge', 'concept', 'Un état de connaissance combine croyance, justification et vérité alléguée sans les confondre.', 'Le système doit distinguer croyance, preuve et statut de validation.', 'belief_store', ['world', 'reflection', 'response'], ['claim_layer_separation', 'knowledge_retractions', 'source_quality'], ['retirer la justification d une croyance vraie par hasard'], ['La vérité externe reste hors du registre local.']),
  contract('ontology.possible-worlds', 'method', 'Les scénarios alternatifs sont des branches explicitement bornées du modèle.', 'Une possibilité ne doit pas être présentée comme un fait observé.', 'possibility_set', ['world', 'reflection'], ['branch_count', 'fact_hypothesis_separation', 'branch_cost'], ['introduire une branche impossible selon les invariants'], ['La couverture des mondes possibles est nécessairement partielle.']),
  contract('ethics.precautionary-principle', 'norm', 'Une incertitude grave et un dommage difficilement réversible peuvent relever le seuil d action.', 'Le coût d une action irréversible doit être visible avant promotion.', 'risk_threshold', ['world', 'response'], ['irreversibility_visibility', 'deferred_actions', 'risk_calibration'], ['comparer une action réversible et une action irréversible à incertitude égale'], ['La précaution peut favoriser l inaction.']),
  contract('politics.pluralism', 'norm', 'Des modèles concurrents peuvent rester représentés tant qu ils sont pertinents.', 'Le consensus ne doit pas supprimer une dissidence sans motif enregistré.', 'model_diversity_ledger', ['relations', 'reflection', 'response'], ['model_diversity', 'dissent_retention', 'convergence_delay'], ['introduire une critique minoritaire correcte et mesurer sa conservation'], ['La pluralité ne remplace pas une décision.']),
  contract('interpretation.construction', 'lens', 'Une interprétation est produite par un cadre déclaré et doit rester révisable.', 'Une interprétation ne doit pas être confondue avec l observation source.', 'interpretation_layer', ['world', 'reflection', 'response'], ['observation_interpretation_separation', 'revision_count', 'frame_visibility'], ['changer le cadre et vérifier la conservation de l observation brute'], ['Plusieurs interprétations peuvent rester sous-déterminées.']),
  contract('core.intervention-not-metaphor', 'constraint', 'Une intervention GenOS est une opération réelle seulement si ses effets et permissions sont vérifiables.', 'Une métaphore ne peut pas déclencher une mutation runtime.', 'operation_authorizer', ['agent', 'world'], ['authorized_operations', 'metaphor_rejections', 'effect_receipts'], ['soumettre une analogie comme permission et vérifier le refus'], ['La validation porte sur l opération, pas sur la théorie.']),
]);

const CONTRACTS = new Map(PILOT_CONTRACTS.map((item) => [item.id, item]));

const TARGET_BY_DOMAIN = Object.freeze({
  ontology: 'world', consciousness: 'agent', cognition: 'world', phenomenology: 'response',
  identity: 'agent', 'social-cognition': 'relations', wellbeing: 'response', computation: 'world',
  prediction: 'world', epistemics: 'reflection', ethics: 'relations', causality: 'world', process: 'topology',
});
const MECHANISM_BY_DOMAIN = Object.freeze({
  ontology: 'WorldModel', consciousness: 'SelfModel', cognition: 'WorldModel', phenomenology: 'InterpretationLayer',
  identity: 'IdentityContinuityTracker', 'social-cognition': 'AgentRelationModel', wellbeing: 'AnswerPlanner',
  computation: 'EvidenceRegistry', prediction: 'PredictionEngine', epistemics: 'BeliefRevision',
  ethics: 'PolicyGate', causality: 'CausalGraph', process: 'TopologyGraph',
});
const SCENARIO_BY_CATEGORY = Object.freeze({
  state: { mode: 'ablation', stimulus: 'retirer ou perturber la représentation d état', observation: 'la différence d état est détectée et tracée' },
  transformation: { mode: 'counterfactual', stimulus: 'exécuter une variation contrôlée', observation: 'la transition et son effet sont comparables' },
  constraint: { mode: 'violation', stimulus: 'soumettre une action qui viole la contrainte', observation: 'l action est signalée ou refusée' },
  organization: { mode: 'topology-comparison', stimulus: 'comparer deux organisations sur la même mission', observation: 'le coût et la distribution des décisions sont mesurés' },
  evaluation: { mode: 'evidence-ablation', stimulus: 'retirer une preuve ou changer le critère', observation: 'la confiance ou le verdict est révisé' },
});
const TOPOLOGY_VARIANTS = Object.freeze(['isolated_critics', 'centralized', 'federated', 'peer_to_peer']);

function contractType(concept) {
  if (concept.role === 'lens') return 'lens';
  if (concept.role === 'speculative') return 'theory';
  if (concept.role === 'operational') return 'method';
  if (['ethics', 'politics', 'law'].includes(concept.domain)) return 'norm';
  return 'notion';
}

function fallbackTargets(concept) {
  const domains = Array.isArray(concept.genosDomains) ? concept.genosDomains : [];
  const targets = domains.map((domain) => TARGET_BY_DOMAIN[domain]).filter(Boolean);
  return [...new Set(targets.length ? targets : ['reflection'])];
}

function scenarioFor(category, conceptId) {
  return { id: 'scenario.' + category, contractId: conceptId, ...SCENARIO_BY_CATEGORY[category] };
}

function experimentFor(category, conceptId, scenario) {
  const experimentId = crypto.createHash('sha256').update(conceptId + '\0' + scenario.id).digest('hex').slice(0, 16);
  return {
    id: 'experiment.' + experimentId,
    hypothesis: 'Le mécanisme associé à ' + conceptId + ' produit une différence observable dans le scénario.',
    baseline: 'Exécuter le même scénario avec le mécanisme désactivé.',
    successCondition: scenario.observation,
    rejectionCondition: 'Aucune différence mesurable, preuve manquante ou résultat non reproductible.',
    evidenceRequired: ['scenario-input', 'scenario-output', 'comparison-receipt'],
    topologies: TOPOLOGY_VARIANTS,
    status: 'planned',
  };
}

function conflictRefs(concept) {
  return (concept.relations || [])
    .filter((relation) => /conflict|oppose|tension|contrad/i.test(relation.type || ''))
    .map((relation) => relation.target)
    .filter(Boolean);
}

function provisionalContract(concept) {
  const interpretation = concept.scope || concept.definition || ('Le concept ' + concept.label + ' doit être opérationnalisé.');
  const category = categoryForConcept(concept);
  const scenario = scenarioFor(category, concept.id);
  return {
    apiVersion: 'genos.contract/v1',
    kind: 'ImplementationContract',
    id: concept.id,
    type: contractType(concept),
    category,
    family: concept.family || concept.domain,
    traditions: [concept.school].filter(Boolean),
    distinctions: concept.aliases || [],
    conflicts: conflictRefs(concept),
    confidence: typeof concept.historicalConfidence === 'number' ? concept.historicalConfidence : null,
    sourceRefs: concept.provenance ? [concept.provenance.sourceDocument || concept.id] : [concept.id],
    scenario,
    experiment: experimentFor(category, concept.id, scenario),
    interpretation,
    targets: fallbackTargets(concept),
    invariant: 'Ne pas attribuer au concept ' + concept.id + ' une autorité runtime sans mécanisme et preuve indépendants.',
    mechanism: MECHANISM_BY_DOMAIN[concept.domain] || 'ReflectionLoop',
    mechanismEvidence: 'mapping-only',
    observables: ['contract_completeness', 'behavioral_delta', 'evidence_coverage'],
    falsificationTests: ['Définir puis exécuter un test qui distingue ' + concept.id + ' d une absence de ce concept.'],
    limits: concept.knownLimits?.length ? concept.knownLimits : ['Interprétation provisoire ; aucun mécanisme exécutable n est encore assigné.'],
    permissions: [],
    obligations: ['conserver la provenance des observations et des décisions'],
    prohibitions: ['présenter ce contrat provisoire comme une capacité implémentée'],
    violationCriteria: ['une sortie affirme que le concept est implémenté avant une preuve comportementale'],
    responsibility: 'Le propriétaire du registre doit compléter le mécanisme et les expériences avant promotion.',
    maturity: 'mechanism-linked',
    status: 'candidate',
    compilationState: 'mapped-pending-behavior',
  };
}

function compileConcept(concept) {
  const definition = CONTRACTS.get(concept.id);
  if (!definition) return provisionalContract(concept);
  const category = categoryForConcept(concept);
  const scenario = scenarioFor(category, concept.id);
  return {
    ...definition,
    category,
    family: concept.family || concept.domain,
    traditions: [concept.school].filter(Boolean),
    distinctions: concept.aliases || [],
    conflicts: conflictRefs(concept),
    confidence: typeof concept.historicalConfidence === 'number' ? concept.historicalConfidence : null,
    sourceRefs: concept.provenance ? [concept.provenance.sourceDocument || concept.id] : [concept.id],
    scenario,
    experiment: experimentFor(category, concept.id, scenario),
    source: concept.provenance || null,
    conceptStatus: concept.status,
    serviceMaturity: concept.serviceMaturity || null,
  };
}

function categoryForConcept(concept) {
  if (['ethics', 'politics', 'law'].includes(concept.domain) || concept.role === 'norm') return 'constraint';
  if (['process', 'causality', 'computation'].includes(concept.domain)) return 'transformation';
  if (['social-cognition', 'identity'].includes(concept.domain)) return 'organization';
  if (['epistemics', 'prediction', 'wellbeing', 'epistemology', 'social-epistemology', 'truth', 'science', 'logic', 'methods', 'mathematics', 'metalogic', 'modality'].includes(concept.domain)) return 'evaluation';
  return 'state';
}

function validateContract(contractValue) {
  const errors = [];
  if (!contractValue || typeof contractValue !== 'object') return ['contract must be an object'];
  const schemaResult = validateSpec('implementation-contract.schema.json', contractValue);
  if (!schemaResult.valid) errors.push(...schemaResult.errors);
  if (contractValue.apiVersion !== 'genos.contract/v1') errors.push('apiVersion must be genos.contract/v1');
  if (contractValue.kind !== 'ImplementationContract') errors.push('kind must be ImplementationContract');
  for (const field of ['id', 'type', 'interpretation', 'invariant', 'mechanism', 'responsibility', 'status']) {
    if (typeof contractValue[field] !== 'string' || !contractValue[field].trim()) errors.push(`${field} must be a non-empty string`);
  }
  if (!['state', 'transformation', 'constraint', 'organization', 'evaluation'].includes(contractValue.category)) {
    errors.push('category is invalid');
  }
  if (!contractValue.scenario || contractValue.scenario.contractId !== contractValue.id) errors.push('scenario must identify its contract');
  if (!contractValue.scenario?.stimulus || !contractValue.scenario?.observation) errors.push('scenario must define stimulus and observation');
  if (!contractValue.experiment || contractValue.experiment.status !== 'planned') errors.push('experiment must be planned');
  if (!contractValue.experiment?.topologies?.includes('isolated_critics')) errors.push('experiment must include the reference topology');
  if (!TOPOLOGY_VARIANTS.every((topology) => contractValue.experiment?.topologies?.includes(topology))) errors.push('experiment must compare all topology variants');
  if (!['scenario-input', 'scenario-output', 'comparison-receipt'].every((evidence) => contractValue.experiment?.evidenceRequired?.includes(evidence))) errors.push('experiment must define the comparison evidence set');
  for (const field of ['targets', 'observables', 'falsificationTests', 'limits', 'obligations', 'prohibitions', 'violationCriteria']) {
    if (!Array.isArray(contractValue[field]) || contractValue[field].length === 0) errors.push(`${field} must be a non-empty array`);
  }
  if (!TARGETS.every((target) => typeof target === 'string')) errors.push('invalid target vocabulary');
  if (!contractValue.targets?.every((target) => TARGETS.includes(target))) errors.push('targets contains an unknown target');
  if (!MATURITY.includes(contractValue.maturity)) errors.push('maturity is invalid');
  return errors;
}

function compileRegistry(concepts) {
  const contracts = concepts.map(compileConcept).filter(Boolean);
  const errors = contracts.flatMap((item) => validateContract(item).map((error) => item.id + ': ' + error));
  const pilotCount = contracts.filter((item) => item.compilationState === undefined).length;
  const mappedCount = contracts.filter((item) => item.compilationState === 'mapped-pending-behavior').length;
  const categoryCounts = Object.fromEntries([...new Set(contracts.map((item) => item.category))]
    .map((category) => [category, contracts.filter((item) => item.category === category).length]));
  return { valid: errors.length === 0, contracts, errors, pilotCount, mappedCount, pendingCount: mappedCount, categoryCounts };
}

function runReadinessProbe(contractValue) {
  const errors = validateContract(contractValue);
  const mapped = contractValue.compilationState === 'mapped-pending-behavior' || contractValue.compilationState === undefined;
  if (!mapped) errors.push('mechanism is not mapped');
  return {
    contractId: contractValue.id,
    status: errors.length === 0 ? 'ready-for-experiment' : 'blocked',
    errors,
    promotionEligible: false,
    evidence: errors.length === 0 ? ['schema-valid', 'scenario-present', 'falsification-plan', 'topology-matrix', 'evidence-plan', 'mechanism-mapped'] : [],
  };
}

function readinessReport(concepts) {
  const compiled = compileRegistry(concepts);
  const probes = compiled.contracts.map(runReadinessProbe);
  return {
    valid: compiled.valid && probes.every((probe) => probe.status === 'ready-for-experiment'),
    total: probes.length,
    readyForExperiment: probes.filter((probe) => probe.status === 'ready-for-experiment').length,
    blocked: probes.filter((probe) => probe.status === 'blocked').length,
    promotionEligible: 0,
    probes,
  };
}

function assessPromotion(contractValue, targetMaturity, evidence = []) {
  const errors = validateContract(contractValue);
  if (!MATURITY.includes(targetMaturity)) errors.push('requested maturity is invalid');
  const currentIndex = MATURITY.indexOf(contractValue.maturity);
  const targetIndex = MATURITY.indexOf(targetMaturity);
  if (targetIndex <= currentIndex) errors.push('requested maturity must be higher than current maturity');
  const required = EVIDENCE_FOR_MATURITY[targetMaturity] || [];
  const missingEvidence = required.filter((item) => !evidence.includes(item));
  return {
    contractId: contractValue.id,
    currentMaturity: contractValue.maturity,
    targetMaturity,
    eligible: errors.length === 0 && missingEvidence.length === 0,
    promotionEligible: false,
    errors,
    missingEvidence,
  };
}

module.exports = { PILOT_CONTRACTS, compileConcept, compileRegistry, validateContract, runReadinessProbe, readinessReport, assessPromotion };
