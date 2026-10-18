'use strict';

const assert = require('assert');
const core = require('../src/services/orchestrationCore');
const stateGraph = require('../src/services/unifiedStateGraph');

// 1. Créer un orchestrateur
const orchestrateur = core.createOrchestrateur({ nom: 'Orchestrateur Principal' });
assert.strictEqual(orchestrateur.kind, 'orchestrateur');
assert.strictEqual(orchestrateur.state, 'INIT');
assert.strictEqual(orchestrateur.nom, 'Orchestrateur Principal');

// 2. Activer l'orchestrateur
const active = core.activerOrchestrateur(orchestrateur);
assert.strictEqual(active.state, 'ACTIVE');
assert.strictEqual(active.version, 2);

// 3. Créer une mission
const { mission } = core.creerMission(active, {
  nom: 'Mission de test',
  objectif: 'Valider le cœur d\'orchestration',
  budget: { max_tokens: 10000, max_cost_usd: 50 }
});
assert.strictEqual(mission.kind, 'mission');
assert.strictEqual(mission.state, 'CREATED');
assert.strictEqual(mission.orchestrateur_id, active.id);
assert.ok(mission.id);

// 4. Vérifier les transitions d'état
assert.strictEqual(stateGraph.nextState('mission', 'CREATED', 'plan'), 'PLANNING');
assert.strictEqual(stateGraph.nextState('mission', 'PLANNING', 'dispatch'), 'DISPATCHED');
assert.strictEqual(stateGraph.nextState('mission', 'DISPATCHED', 'execute'), 'EXECUTING');
assert.strictEqual(stateGraph.nextState('mission', 'EXECUTING', 'verify'), 'VERIFYING');
assert.strictEqual(stateGraph.nextState('mission', 'VERIFYING', 'integrate'), 'INTEGRATING');
assert.strictEqual(stateGraph.nextState('mission', 'INTEGRATING', 'complete'), 'TERMINATED');
assert.ok(stateGraph.isTerminal('mission', 'TERMINATED'));
assert.ok(stateGraph.isTerminal('mission', 'FAILED'));
assert.ok(!stateGraph.isTerminal('mission', 'EXECUTING'));

// 5. Planifier la mission
const planifiee = core.planifierMission(mission, {
  strategie: 'strategie-a-team',
  portfolio: [{ id: 's1', role: 'primary' }],
  branches: ['hyp1', 'hyp2']
});
assert.strictEqual(planifiee.state, 'PLANNING');
assert.strictEqual(planifiee.strategie, 'strategie-a-team');
assert.strictEqual(planifiee.portfolio.length, 1);
assert.strictEqual(planifiee.branches.length, 2);

// 6. Sélectionner une stratégie
const avecStrategie = core.selectionnerStrategie(planifiee, { criteres: { type: 'autonomous' } });
assert.ok(avecStrategie.strategie);

// 7. Lier un contrat de stratégie
const avecContratStrategie = core.lierContratStrategie(avecStrategie, {
  mission: 'test mission',
  problem_profile: { type: 'task', risk: 'low', uncertainty: 0.1 }
});
assert.ok(avecContratStrategie.contrat);
assert.strictEqual(avecContratStrategie.contrat.schema, 'genos.strategy-contract/v1alpha1');

// 8. Créer une tâche
const { tache } = core.creerTache(avecContratStrategie, {
  nom: 'Tâche de validation',
  worker_kind: 'bounded_worker',
  budget: { max_tokens: 5000 }
});
assert.strictEqual(tache.kind, 'tache');
assert.strictEqual(tache.state, 'CREATED');
assert.strictEqual(tache.worker_kind, 'bounded_worker');

// 9. Passer la tâche en ASSIGNED (simulé)
const tacheAssignee = { ...tache, state: 'ASSIGNED' };

// 10. Créer un run
const { run } = core.creerRun(tacheAssignee, {
  branches: ['branch-1'],
  checkpoint: 'ck-1',
  wal_head: 'wh-1',
  trajectoire: [{ etape: 'preparation', ts: new Date().toISOString() }],
  lignage: 'lig-1'
});
assert.strictEqual(run.kind, 'run');
assert.strictEqual(run.state, 'PREPARED');
assert.strictEqual(run.checkpoint, 'ck-1');
assert.strictEqual(run.wal_head, 'wh-1');
assert.strictEqual(run.lignage, 'lig-1');
assert.strictEqual(run.trajectoire.length, 1);

// 11. Lier capsule et workspace contrefactuel
const avecCapsule = core.lierCapsule(run, 'capsule-1');
assert.strictEqual(avecCapsule.capsule, 'capsule-1');

const avecWorkspace = core.lierWorkspaceContrefactuel(avecCapsule, 'ws-contrefactuel-1');
assert.strictEqual(avecWorkspace.workspace_contrefactuel, 'ws-contrefactuel-1');

// 12. Créer un job
const { job } = core.creerJob(run, { max_attempts: 3, retryable: true });
assert.strictEqual(job.kind, 'job');
assert.strictEqual(job.state, 'QUEUED');
assert.strictEqual(job.max_attempts, 3);
assert.strictEqual(job.attempts, 0);
assert.strictEqual(job.retryable, true);
assert.strictEqual(job.dead_letter, false);

// 13. Créer un worker
const { worker } = core.creerWorker(job, {
  worker_kind: 'bounded_worker',
  is_survivant: false,
  is_preferable: true
});
assert.strictEqual(worker.kind, 'worker');
assert.strictEqual(worker.state, 'INCARNATED');
assert.strictEqual(worker.is_preferable, true);

// 14. Lier un contrat de méthode
const avecContratMethode = core.lierContratMethode(worker, {
  methodId: 'm1',
  methodName: 'execute_strategy',
  parameters: { strategyId: 's1' },
  preconditions: [{ id: 'p1', message: 'budget ok', satisfied: () => true }],
  budget: { max_tokens: 2000 }
});
assert.strictEqual(avecContratMethode.method_contract.status, 'bound');
assert.strictEqual(avecContratMethode.state, 'BOUND');

// 15. Exécuter le contrat de méthode
const avecExecution = core.executerContratMethode(avecContratMethode, { provenance: 'test' });
assert.strictEqual(avecExecution.method_contract.status, 'executed');
assert.ok(avecExecution.method_contract.receipt);
assert.ok(avecExecution.execution_result.ok);

// 16. Passer le worker en EVIDENCE puis marquer survivant
const workerEvidence = { ...avecExecution, state: 'EVIDENCE' };
const survivant = core.marquerSurvivant(workerEvidence);
assert.strictEqual(survivant.is_survivant, true);
assert.strictEqual(survivant.state, 'SURVIVOR');

// 17. Marquer préférable
const preferable = core.marquerPreferable(survivant);
assert.strictEqual(preferable.is_preferable, true);

// 18. Créer une branche
const avecBranche = core.ajouterBranche(avecContratStrategie, 'hypothese-alternative', 0.3);
assert.strictEqual(avecBranche.branches.length, 3);
assert.strictEqual(avecBranche.branches[2].budget_share, 0.3);

// 19. Créer un chargeback
const cb = core.creerChargeback(avecContratStrategie, {
  chargebackId: 'cb-test-1',
  budgetScope: 'mission',
  currency: 'USD'
});
assert.strictEqual(cb.kind, undefined); // chargeback n'a pas de kind dans ce schéma
assert.strictEqual(cb.mission_id, avecContratStrategie.id);
assert.strictEqual(cb.status, 'open');

// 20. Ajouter une ligne de chargeback
const cbAvecLigne = core.ajouterLigneChargeback(cb, {
  id: 'li-1',
  description: 'inférence',
  amountUsd: 12.50,
  category: 'inference'
});
assert.strictEqual(cbAvecLigne.total_amount_usd, 12.50);

// 21. Régler le chargeback
const { chargeback: cbRegle, receipt } = core.reglerChargeback(cbAvecLigne);
assert.strictEqual(cbRegle.status, 'settled');
assert.ok(cbRegle.settled_at);
assert.ok(receipt.valid);
assert.strictEqual(receipt.total_amount_usd, 12.50);

// 22. Créer un plan de rollback atomique
const planRb = core.creerPlanRollbackAtomique(avecContratStrategie, {
  planId: 'rb-test-1',
  checkpointId: 'ck-1',
  walHead: 'wh-1'
});
assert.strictEqual(planRb.schema, 'genos.atomic-rollback/v1');
assert.strictEqual(planRb.status, 'prepared');

// 23. Commettre le rollback atomique (avec invariants satisfaits)
const planAvecInv = { ...planRb, invariants: [{ id: 'inv1', expression: () => true }] };
const commitResult = core.commettreRollbackAtomique(planAvecInv);
assert.ok(commitResult.ok);
assert.strictEqual(commitResult.plan.status, 'committed');
assert.ok(commitResult.receipt.valid);

// 24. Effectuer un rollback (sur un plan préparé)
const planRb2 = core.creerPlanRollbackAtomique(avecContratStrategie, { planId: 'rb-test-2' });
const rollbackResult = core.effectuerRollbackAtomique(planRb2);
assert.ok(rollbackResult.ok);
assert.strictEqual(rollbackResult.plan.status, 'rolled_back');

// 25. Terminer la mission
const terminee = core.terminerMission(avecContratStrategie, 'complete');
assert.strictEqual(terminee.state, 'TERMINATED');

// 26. Reprendre une mission échouée
const echouee = { ...avecContratStrategie, state: 'FAILED' };
const reprisee = core.reprendre(echouee, { plan: 'plan-de-reprise' });
assert.strictEqual(reprisee.state, 'PLANNING');
assert.ok(reprisee.reprise);

// 27. Vérifier les transitions job
assert.strictEqual(stateGraph.nextState('job', 'QUEUED', 'claim'), 'CLAIMED');
assert.strictEqual(stateGraph.nextState('job', 'CLAIMED', 'run'), 'RUNNING');
assert.strictEqual(stateGraph.nextState('job', 'RUNNING', 'complete'), 'COMPLETED');
assert.strictEqual(stateGraph.nextState('job', 'RUNNING', 'dead_letter'), 'DEAD_LETTER');
assert.ok(stateGraph.isTerminal('job', 'DEAD_LETTER'));

// 28. Vérifier les transitions worker
assert.strictEqual(stateGraph.nextState('worker', 'INCARNATED', 'bind'), 'BOUND');
assert.strictEqual(stateGraph.nextState('worker', 'BOUND', 'execute'), 'EXECUTING');
assert.strictEqual(stateGraph.nextState('worker', 'EXECUTING', 'evidence'), 'EVIDENCE');
assert.strictEqual(stateGraph.nextState('worker', 'EVIDENCE', 'survive'), 'SURVIVOR');
assert.ok(stateGraph.isTerminal('worker', 'TERMINATED'));

console.log('✓ Tous les tests d\'intégration du cœur d\'orchestration sont passés');
