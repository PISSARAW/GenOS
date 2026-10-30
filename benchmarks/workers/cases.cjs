'use strict';

const { createHash } = require('node:crypto');
const { runProcedure } = require('../../backend/src/services/agents/deterministicWorkerProcedures');

const VERIFICATION_PROCEDURE = { version: 1, methodId: 'subset_sum',
  parameters: { values: [3, 5, 7], target: 10 } };
const CANDIDATE_RECEIPT = runProcedure(VERIFICATION_PROCEDURE).receipt;
const RECOVERY_CHECKPOINT = 'verified-checkpoint-state';
const RECOVERY_CURRENT = 'damaged-state';
const CODE_EXPRESSION = '((a % b) + b) % b';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const CASES = Object.freeze([
  { id: 'scout-source', workerKind: 'scout_cell', task: 'Relever le terme timeout dans une source fournie.',
    methodContract: { version: 1, methodId: 'scan_literal', parameters: {
      sources: [{ sourceRef: 'corpus://benchmark/log-1', text: 'status=ok timeout=30' }],
      terms: ['timeout'] } }, oracle: { path: 'observations.0.offset', equals: 10 } },
  { id: 'daemon-anomaly', workerKind: 'resident_daemon', task: 'Détecter un dépassement dans une fenêtre bornée.',
    methodContract: { version: 1, methodId: 'monitor_samples', parameters: {
      territoryId: 'benchmark-sensor', threshold: 10, samples: [
        { value: 4, observedAt: '2026-10-04T10:00:00Z', sourceRef: 'sensor://benchmark/1' },
        { value: 12, observedAt: '2026-10-04T10:01:00Z', sourceRef: 'sensor://benchmark/2' }
      ] } }, oracle: { path: 'anomalies.0.value', equals: 12 } },
  { id: 'bounded-code', workerKind: 'bounded_worker', task: 'Corriger un bug borné et produire un diff vérifié.',
    oracle: { path: 'codeCompletion.verified', equals: true } },
  { id: 'bounded-procedure', workerKind: 'bounded_worker', task: 'Exécuter le sous-ensemble borné dans le scope assigné.',
    methodContract: { version: 1, methodId: 'scoped_procedure', parameters: {
      procedure: VERIFICATION_PROCEDURE } }, oracle: { path: 'result.found', equals: true } },
  { id: 'adaptive-probes', workerKind: 'adaptive_worker', task: 'Répéter deux essais contrôlés avec la stratégie LPT implémentée.',
    methodContract: { version: 1, methodId: 'adapt_procedure', parameters: { trials: [
      { strategy: 'controlled_probe', procedure: { version: 1, methodId: 'lpt', parameters: {
        jobs: [{ id: 'A', duration: 5 }, { id: 'B', duration: 4 }, { id: 'C', duration: 3 }], machines: 2 } } },
      { strategy: 'controlled_probe', procedure: { version: 1, methodId: 'lpt', parameters: {
        jobs: [{ id: 'A', duration: 5 }, { id: 'B', duration: 4 }, { id: 'C', duration: 3 }], machines: 2 } } }
    ] } }, oracle: { path: 'result.makespan', equals: 7 } },
  { id: 'specialist-niche', workerKind: 'specialist', task: 'Résoudre une tâche dans une niche déclarée et refuser une tâche hors niche.',
    methodContract: { version: 1, methodId: 'niche_procedure', parameters: {
      niche: 'scheduling', procedure: VERIFICATION_PROCEDURE } }, oracle: { path: 'specialtyAssessment.inScope', equals: true } },
  { id: 'lpt-schedule', workerKind: 'procedural_executor', task: 'Affecter les travaux selon LPT.',
    methodContract: { version: 1, methodId: 'lpt', parameters: { jobs: [
      { id: 'A', duration: 5 }, { id: 'B', duration: 4 }, { id: 'C', duration: 3 }
    ], machines: 2 } }, oracle: { path: 'output.makespan', equals: 7 } },
  { id: 'subset-sum', workerKind: 'procedural_executor', task: 'Trouver un sous-ensemble de somme 10.',
    methodContract: { version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } },
    oracle: { path: 'output.found', equals: true } },
  { id: 'prime-integral', workerKind: 'math_worker', task: 'Calculer exactement les intégrales premières bornées.',
    methodContract: { version: 1, methodId: 'compute_integral', parameters: { terms: [2, 3, 5] } },
    oracle: { path: 'output.I_2', equals: 'pi/2' } },
  { id: 'host-bound', workerKind: 'symbiotic_worker', task: 'Exécuter une contribution autorisée par le contrat hôte.',
    methodContract: { version: 1, methodId: 'host_procedure', parameters: {
      capability: 'deterministic_procedure', procedure: VERIFICATION_PROCEDURE } },
    oracle: { path: 'hostContribution.contractCompliant', equals: true } },
  { id: 'verify-claim', workerKind: 'verifier_worker', task: 'Recalculer indépendamment le reçu de procédure.',
    methodContract: { version: 1, methodId: 'verify_procedure', parameters: {
      procedure: VERIFICATION_PROCEDURE, candidateReceipt: CANDIDATE_RECEIPT
    } }, oracle: { path: 'verdict', equals: 'accept' } },
  { id: 'code-postconditions', workerKind: 'verifier_worker', task: 'Vérifier le code modulo euclidien sur le contrat borné de 264 entrées.',
    methodContract: { version: 1, methodId: 'verify_code_postconditions', parameters: {
      artifactPath: 'src/answer.gexpr', contractId: 'euclidean_modulo_v1',
      expectedContentHash: sha256(CODE_EXPRESSION) } }, oracle: { path: 'verdict', equals: 'accept' } },
  { id: 'red-counterexample', workerKind: 'red_worker', task: 'Trouver un contre-exemple reproductible.',
    methodContract: { version: 1, methodId: 'falsify_procedure', parameters: {
      procedure: VERIFICATION_PROCEDURE,
      candidateReceipt: { ...CANDIDATE_RECEIPT, result: { found: false } }
    } }, oracle: { path: 'verdict', equals: 'reject' } },
  { id: 'experiment-measure', workerKind: 'experimental_worker', task: 'Mesurer le makespan LPT pour une hypothèse bornée.',
    methodContract: { version: 1, methodId: 'measure_lpt', parameters: { jobs: [
      { id: 'A', duration: 5 }, { id: 'B', duration: 4 }, { id: 'C', duration: 3 }
    ], machines: 2, threshold: 7 } }, oracle: { path: 'measurements.0.value', equals: 7 } },
  { id: 'lean-arithmetic', workerKind: 'formal_worker', task: 'Prouver 2 + 2 = 4 dans Lean.',
    methodContract: { version: 1, methodId: 'formal_proof', parameters: { claim: '2 + 2 = 4', toolchainVersion: '' } },
    oracle: { path: 'result', equals: 'proved' } },
  { id: 'lean-theorem-proving', workerKind: 'formal_worker', task: 'Prouver un théorème arithmétique borné avec Lean.',
    methodContract: { version: 1, methodId: 'theorem_proving', parameters: { claim: '2 * 3 = 6', toolchainVersion: '' } },
    oracle: { path: 'result', equals: 'proved' } },
  { id: 'closed-arithmetic', workerKind: 'formal_worker', task: 'Évaluer exactement une proposition arithmétique bornée.',
    methodContract: { version: 1, methodId: 'check_arithmetic', parameters: { claim: '2 + 2 * 3 = 8' } },
    oracle: { path: 'result', equals: 'proved' } },
  { id: 'synthesis-conflict', workerKind: 'synthesis_worker', task: 'Préserver deux positions contradictoires et leurs références.',
    methodContract: { version: 1, methodId: 'synthesize_claims', parameters: { sources: [
      { sourceRef: 'source://benchmark/a', claim: 'Le déploiement est sûr.', position: 'oui' },
      { sourceRef: 'source://benchmark/b', claim: 'Le déploiement est sûr.', position: 'non' }
    ] } }, oracle: { path: 'disagreements.0.claim', equals: 'Le déploiement est sûr.' } },
  { id: 'creative-candidate', workerKind: 'creative_worker', task: 'Énumérer des candidats à partir d’options déclarées et fournir un test de falsification.',
    methodContract: { version: 1, methodId: 'combine_candidates', parameters: {
      dimensions: [{ name: 'Claim', options: ['Bounded claims', 'Unbounded claims'] },
        { name: 'Reason', options: ['Independent recomputation', 'Self reported result'] }],
      assumptions: ['The fixture goal and source attributions are authoritative for ranking only.'],
      falsificationTest: 'Check that the selected options match the cited goal cues.',
      sourceRefs: ['source://creative/bounds', 'source://creative/oracle'],
      goal: 'Improve bounded claims with independent recomputation.', evidence: [
        { dimension: 'Claim', option: 'Bounded claims', goalCue: 'bounded claims', sourceRef: 'source://creative/bounds' },
        { dimension: 'Reason', option: 'Independent recomputation', goalCue: 'independent recomputation', sourceRef: 'source://creative/oracle' }
      ] } }, oracle: { path: 'candidate', equals: 'Claim: Bounded claims; Reason: Independent recomputation' } },
  { id: 'medical-education', workerKind: 'medical_worker', task: 'Projeter les références d’un cas synthétique éducatif sans conseil médical individuel.',
    methodContract: { version: 1, methodId: 'review_synthetic_case', parameters: {
      caseScope: 'synthetic_educational', vignette: 'Fictional headache after poor sleep.',
      considerations: [{ consideration: 'Sleep loss can accompany headache.', sourceRef: 'source://medical/synthetic' }],
      uncertainty: 'A vignette does not establish a cause.' } }, oracle: { path: 'caseScope', equals: 'synthetic_educational' } },
  { id: 'recovery-state', workerKind: 'recovery_worker', task: 'Restaurer un état de test depuis un checkpoint sous bail.',
    methodContract: { version: 1, methodId: 'restore_checkpoint', parameters: {
      path: 'state.txt', content: RECOVERY_CHECKPOINT, checkpointDigest: sha256(RECOVERY_CHECKPOINT),
      expectedCurrentDigest: sha256(RECOVERY_CURRENT) } },
    oracle: { path: 'recoveryReceipt.restoredState', equals: `sha256:${sha256(RECOVERY_CHECKPOINT)}` } },
  { id: 'forensic-chain', workerKind: 'forensic_worker', task: 'Reconstituer les liens explicitement attestés entre événements.',
    methodContract: { version: 1, methodId: 'trace_declared_causes', parameters: { events: [
      { id: 'deploy', occurredAt: '2026-10-04T10:00:00Z', sourceRef: 'incident://benchmark/deploy' },
      { id: 'alert', occurredAt: '2026-10-04T10:01:00Z', sourceRef: 'incident://benchmark/alert',
        causedBy: { eventId: 'deploy', receiptRef: 'incident://benchmark/causation' } }
    ] } }, oracle: { path: 'causalChain.0.from', equals: 'deploy' } },
  { id: 'liaison-delivery', workerKind: 'liaison_worker', task: 'Préparer une passation sourcée vers un groupe destinataire.',
    methodContract: { version: 1, methodId: 'prepare_handoff', parameters: {
      sourceGroup: 'producers', targetGroup: 'reviewers', items: [
        { sourceRef: 'source://brief', summary: 'Review the brief.' },
        { sourceRef: 'receipt://handoff', summary: 'Check the receipt.' },
        { sourceRef: 'source://brief', summary: 'Review the brief again.' }
      ] } }, oracle: { path: 'handoff.recipientAcknowledged', equals: false } },
  { id: 'teaching-transfer', workerKind: 'teaching_worker', task: 'Enseigner subset_sum et contrôler un témoin d’apprentissage.',
    methodContract: { version: 1, methodId: 'teach_subset_sum', parameters: {
      procedure: VERIFICATION_PROCEDURE, learnerIndices: [0, 2],
      prerequisites: ['Addition d’entiers', 'Indices distincts']
    } }, oracle: { path: 'transferCheck.passed', equals: true } },
  { id: 'subgraph-delegation', workerKind: 'sub_orchestrator', task: 'Coordonner deux enfants persistés dans un sous-graphe borné.',
    methodContract: { version: 1, methodId: 'coordinate_children', parameters: { children: [
      { workerKind: 'bounded_worker', mission: 'Solve the delegated subset-sum fixture.',
        methodContract: { version: 1, methodId: 'scoped_procedure', parameters: {
          procedure: VERIFICATION_PROCEDURE } } },
      { workerKind: 'scout_cell', mission: 'Find the delegated literal in the sealed fixture.',
        methodContract: { version: 1, methodId: 'scan_literal', parameters: {
          sources: [{ sourceRef: 'corpus://delegation/fixture', text: 'worker=completed' }], terms: ['completed']
        } } }
    ] } }, oracle: { path: 'mission.outcome', equals: 'success' } }
]);

module.exports = { CASES, CODE_EXPRESSION };
