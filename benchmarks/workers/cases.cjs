'use strict';

const { runProcedure } = require('../../backend/src/services/agents/deterministicWorkerProcedures');

const VERIFICATION_PROCEDURE = { version: 1, methodId: 'subset_sum',
  parameters: { values: [3, 5, 7], target: 10 } };
const CANDIDATE_RECEIPT = runProcedure(VERIFICATION_PROCEDURE).receipt;

const CASES = Object.freeze([
  { id: 'scout-source', workerKind: 'scout_cell', task: 'Observer un corpus local et citer chaque observation.' },
  { id: 'daemon-anomaly', workerKind: 'resident_daemon', task: 'Détecter une anomalie dans un flux borné, puis fournir le reçu.' },
  { id: 'bounded-code', workerKind: 'bounded_worker', task: 'Corriger un bug borné et produire un diff vérifié.' },
  { id: 'adaptive-shift', workerKind: 'adaptive_worker', task: 'Changer de stratégie après une mesure défavorable.' },
  { id: 'specialist-niche', workerKind: 'specialist', task: 'Résoudre une tâche dans une niche déclarée et refuser une tâche hors niche.' },
  { id: 'lpt-schedule', workerKind: 'procedural_executor', task: 'Affecter les travaux selon LPT.',
    methodContract: { version: 1, methodId: 'lpt', parameters: { jobs: [
      { id: 'A', duration: 5 }, { id: 'B', duration: 4 }, { id: 'C', duration: 3 }
    ], machines: 2 } }, oracle: { path: 'output.makespan', equals: 7 } },
  { id: 'subset-sum', workerKind: 'procedural_executor', task: 'Trouver un sous-ensemble de somme 10.',
    methodContract: { version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } },
    oracle: { path: 'output.found', equals: true } },
  { id: 'host-bound', workerKind: 'symbiotic_worker', task: 'Exécuter une contribution autorisée par le contrat hôte.' },
  { id: 'verify-claim', workerKind: 'verifier_worker', task: 'Recalculer indépendamment le reçu de procédure.',
    methodContract: { version: 1, methodId: 'verify_procedure', parameters: {
      procedure: VERIFICATION_PROCEDURE, candidateReceipt: CANDIDATE_RECEIPT
    } }, oracle: { path: 'verdict', equals: 'accept' } },
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
  { id: 'synthesis-conflict', workerKind: 'synthesis_worker', task: 'Préserver deux positions contradictoires et leurs références.',
    methodContract: { version: 1, methodId: 'synthesize_claims', parameters: { sources: [
      { sourceRef: 'source://benchmark/a', claim: 'Le déploiement est sûr.', position: 'oui' },
      { sourceRef: 'source://benchmark/b', claim: 'Le déploiement est sûr.', position: 'non' }
    ] } }, oracle: { path: 'disagreements.0.claim', equals: 'Le déploiement est sûr.' } },
  { id: 'creative-candidate', workerKind: 'creative_worker', task: 'Produire un candidat original et un test de falsification.' },
  { id: 'medical-education', workerKind: 'medical_worker', task: 'Analyser un cas synthétique à visée éducative sans conseil médical individuel.' },
  { id: 'recovery-state', workerKind: 'recovery_worker', task: 'Restaurer un état de test et prouver le résultat.' },
  { id: 'forensic-chain', workerKind: 'forensic_worker', task: 'Relier des événements à des observations sans causalité inventée.' },
  { id: 'liaison-delivery', workerKind: 'liaison_worker', task: 'Transmettre des références à un groupe destinataire avec reçu.' },
  { id: 'teaching-transfer', workerKind: 'teaching_worker', task: 'Enseigner une procédure validée et contrôler son transfert.' },
  { id: 'subgraph-delegation', workerKind: 'sub_orchestrator', task: 'Coordonner deux enfants dans un sous-graphe borné.' }
]);

module.exports = { CASES };
