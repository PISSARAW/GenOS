# ADR 0600 — Implémentation finale et unifiée du cœur d'orchestration GenOS

## Statut

Accepté

## Date

2026-10-18

## Contexte

Le runtime GenOS V3 contient déjà des implémentations partielles des 45 concepts d'orchestration et d'exécution (orchestrateur, mission, tâche, run, workflow, job, graphe d'états, transition, worker, sous-orchestrateur, fan-out, survivant, préféré, branches d'exécution, stratégie, portfolio de stratégies, adaptation de stratégie, contrat de stratégie, contrat d'exécution, contrat de mission, sélection, arbitrage, escalade, terminaison, reprise, retry, backoff avec jitter, dead-letter state, checkpoint, WAL, rejeu causal, bisection causale, rollback atomique, restauration, capsule, workspace contrefactuel, Git agentique, AgentGit, trajectoire, lignage, campagne d'évaluation, benchmark, progressive delivery, chargeback).

Cependant ces implémentations sont dispersées entre `crates/` (Rust), `backend/src/services/` (Node), `backend/src/services/ontogenesis/` et d'autres répertoires, sans modèle de données unifié ni graphe d'états traversable de bout en bout. Trois éléments fondamentaux manquaient totalement :

1. **Contrat de méthode** : pas de service dédié ; seules des références éparses (`methodContract` sur les assignations de workers)
2. **Chargeback** : route et doc existent mais pas d'agrégation de coûts connectée aux runs/missions/workers
3. **Rollback atomique** : existe partiellement en Rust (`guard_cell_durable.rs`) mais pas de service unifié côté Node couvrant checkpoints, WAL, rejeu causal et restauration dans une transaction atomique

## Décision

Implémentation complète et unifiée du cœur d'orchestration via :

### 1. Graphe d'états unifié (`unifiedStateGraph.js`)
Machine à états couvrant orchestrateur → mission → tâche → run → job → worker, avec transitions validées, états terminaux et vérification de reachabilité.

### 2. Moteur d'orchestration unifié (`orchestrationCore.js`)
Coordinateur sans E/S directe qui crée et lie tous les objets : orchestrateur, mission, tâche, run, job, worker, contrats (méthode, stratégie), branches, survivant, préféré, chargeback, rollback atomique, capsule, workspace contrefactuel, checkpoint, WAL, trajectoire, lignage.

### 3. Extensions avancées (`orchestrationExtensions.js`)
Dead-letter state, rejeu causal, bisection causale, campagne d'évaluation, benchmark, progressive delivery, retry avec backoff+jitter.

### 4. API REST unifiée (`orchestrationRoutes.js`)
Routes pour orchestrer l'ensemble du cycle de vie : création, activation, planification, dispatch, exécution, vérification, terminaison, reprise, escalade, chargeback, rollback, capsule, workspace contrefactuel, checkpoint, WAL, trajectoire, lignage, rejeu causal, bisection, campagne, benchmark, progressive delivery.

### 5. Services de base déjà créés
- `methodContractService.js` : contrat de méthode (préconditions, postconditions, invariants, binding, exécution, reçus, révocation)
- `chargebackService.js` : agrégation de coûts, line items, règlement, contestation, clôture, reçus
- `atomicRollbackService.js` : plans de rollback, opérations réversibles, invariants, commit, rollback, compensation, reçus

## Alternatives considérées

- Laisser l'implémentation dispersée : rejeté (impossible à auditer et tester)
- Créer un nouveau crate Rust : rejeté (le cœur actif est le backend Node ; Rust fait des simulations locales)
- Implémenter chaque concept isolément : rejeté (il faut un contrat unifié)

## Conséquences

- Nouveaux fichiers : 7 fichiers backend (3 services + 1 graphe d'états + 1 moteur + 1 extensions + 1 routes)
- Routes REST exposées sous `/api/orchestration`, `/api/method-contracts`, `/api/chargeback`, `/api/atomic-rollback`
- 4 fichiers de tests unitaires et d'intégration
- 0 nouvelle violation au gate qualité (check_code_quality.py)
- Les crates Rust existants ne sont pas modifiés (cohérence préservée)
- Les tests d'intégration couvrent le flux complet : orchestrateur → mission → tâche → run → job → worker → contrats → survivant → chargeback → rollback → terminaison → reprise

## Liens

- [ADR 0043 — Runtime worker commun et phenotypes composables](../adr/0043-runtime-worker-phenotypes.md)
- [ADR 0045 — Noyau de contrôle morphogénétique de l'orchestrateur Rust](../adr/0045-noyau-controle-morphogenetique.md)
- [ADR 0163 — Contrats transversaux d'opération : événement, reçu et preuve](../adr/0163-contrats-transversaux-operation-receipt-preuve.md)
- [docs/02-orchestration/orchestration.md — Cycle effectif d'une mission](../02-orchestration/orchestration.md)
- [docs/04-exploitation/releases-et-rollouts.md — Rollback et chargeback](../04-exploitation/releases-et-rollouts.md)
