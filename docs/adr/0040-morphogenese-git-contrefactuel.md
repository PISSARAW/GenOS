---
title: Morphogenese versionnee Git et contrefactuelle
date: 2026-09-23
status: proposed
authors: GenOS
decision-id: 0040
---

# ADR 0040 : Morphogenèse versionnée Git et contrefactuelle

## Statut

- **Statut** : Proposé
- **Date** : 2026-09-23
- **Domaine** : Orchestration, morphogenèse, Git agentique, contrefactuel, substrat de calcul
- **Décideurs** : GenOS
- **Lié à** : [0038](0038-boucle-controle-cognitif-morphogenese.md), [0039](0039-systemes-vitaux-agents-6-10.md), [0003](0003-fossilization-stratigraphic-archive.md), [0005](0005-reorganisation-arborescence-documentaire.md)

## Contexte

GenOS possède les briques mais pas le cycle officiel :

- `morphogenesisPlannerService.planMorphogenesis` choisit une topologie, `extendPlan` (14 dimensions + receipt SHA) et `annotatePlanWithSubstrates` annotent déjà le plan ;
- `transitionEngineService.executeTransition` applique `VALIDATE → SNAPSHOT → PREPARE → SPAWN/REBIND → MIGRATE → VERIFY → COMMIT` avec `ROLLBACK` ;
- `morphogenesisGitService.executeVersionedTransition` versionne déjà `VALIDATE → SNAPSHOT → APPLY → VERIFY → COMMIT` vers `agentGitService` (`createCommit`, `collectState`, `updateRef`, miroir `agent_git_commits`, `branchLineage`, `fossiliseLineage`, `getLineage`) ;
- le contrefactuel existe (`counterfactualComparison.compareEffects/promoteWinner`, `workspaceSnapshotStore.capture/materialize/restore/runInSnapshot`, `vfsSandboxService` CoW + `calculateBlastRadius`, `bisectionService.bisectAnomaly/diffWorkspaces`) mais n'est pas le passage obligé avant promotion ;
- `computeSubstrateResolver.resolve/annotatePlanWithSubstrates` distingue déjà `cpu, gpu, vfs_workers, cpu_solver, remote_model, qpu` ;
- le vocabulaire reste ambigu : `quantum-world`, `sandbox-backend: quantum` désignent un backend classique (voir `docs/02-orchestration/workspaces-contrefactuel.md`).

Sans cycle scellé, une transition peut être appliquée sans parent Git, sans fork borné, sans comparaison causale, et un fossile peut être confondu avec une branche ressuscitable.

## Décision

Faire du cycle suivant le seul chemin officiel de toute transformation morphologique (topologie, agents, leases, capacités, relations, plasmides, DNA, budgets, substrat) :

```text
PLAN → VALIDATE → SNAPSHOT(parent) → BRANCH → FORK(VFS) → EXPERIMENT(bornée)
→ COMPARE → PROMOTION GATE → APPLY → VERIFY → COMMIT → (REVERT | FOSSIL)
```

Mappings obligatoires (aucun nouveau silo) :

1. **PLAN** : `morphogenesisPlannerService.planMorphogenesis` + `extendPlan` + `annotatePlanWithSubstrates`. Le plan porte `reason`, `evidence`, `executionSubstrate`, `counterfactualRef` (nullable).
2. **VALIDATE** : `validatePlan` (+ `cognitiveControlLoopService.decideMorphology` quand `ctx.expression` présent, ADR 0038). Refus = arrêt, pas de fork.
3. **SNAPSHOT(parent)** : `collectiveStateService.createSnapshot` + `agentGitService.collectState`. Le `parentCommitId` est lu dans `agent_git_refs[main]` ; deux snapshots identiques partagent le même `tree_hash`, le `commit_hash` distingue parents/métadonnées.
4. **BRANCH** : `morphogenesisGitService.branchLineage` pour toute lignée (`lineage/security-A`, `fossil/<id>` en tag). Fusion Git d'état ≠ reproduction génétique (`cross/mutate`) : deux mécanismes, deux preuves.
5. **FORK(VFS)** : `workspaceSnapshotStore.capture/materialize` + capsules `vfsSandboxService` Copy-on-Write (deltas par monde). Registre `counterfactual_worlds` : `draft → sealed → running → evaluated → promoted | discarded`.
6. **EXPERIMENT(bornée)** : `runInSnapshot` + commandes autorisées + `calculateBlastRadius` (`BR = min(100, 5 + min(45, n×15) + 35·I_destructive + 15·I_admin)`). Toute action destructive hors capsule = rejet.
7. **COMPARE** : `counterfactualComparison.compareEffects` (`delta`, `normalized_effect = delta / baseline`, `computeNecessity`) + `bisectionService.diffWorkspaces/bisectAnomaly` pour le point de divergence. Corrélation ≠ causalité : le replay avec intervention n'est qu'une évidence faible.
8. **PROMOTION GATE** : `counterfactualComparison.promoteWinner` exige `normalized_effect > 0` + `validatePlan` OK ; sinon `discardSiblings`, aucun merge. `strategyPromotionPolicyService` reste le seul merge de fichiers workspace.
9. **APPLY + VERIFY** : `transitionEngineService.executeTransition` puis tests/preuves. Échec = `rollbackSnapshot` / `remediateRollback`, pas de commit.
10. **COMMIT** : `morphogenesisGitService.executeVersionedTransition/commitTransition` → `createCommit` + miroir `agent_git_commits(parent, tree_hash, commit_hash, reason, evidence_json, changes_json)` + `updateRef[main]`. `changes` couvre topologie, agents, leases, capacités, relations, plasmides, DNA, budgets, substrat.
11. **FOSSIL** : `fossiliseLineage` → `recordFossil` + commit tag `fossil/<id>` immuable. `excavate/decode` restent lecture seule (ADR 0003) : on forke depuis l'information du fossile, on ne ressuscite jamais le fossile.
12. **SUBSTRAT** : `computeSubstrateResolver` choisit `cpu (branch_diff, snapshot) / gpu (scoring_batch) / vfs_workers (isolated_patch) / cpu_solver (sat_solve) / remote_model (llm_inference) / qpu (quantum_circuit uniquement)`. Fallback `cpu` dégradé si aucun substrat ne convient.
13. **VOCABULAIRE** : `CounterfactualVFS` pour le substrat CoW ; `quantum-inspired selection` pour l'analogie seule (mondes ouverts → gate → monde promu) ; `QPU` réservé à un circuit explicite. Les identifiants historiques `quantum-world`, `sandbox-backend: quantum` sont des alias de compatibilité du backend classique, pas du calcul quantique.

## Conséquences

Positives :

- toute morphogenèse est traçable (DAG), réversible (`revert`), comparable (deltas contrefactuels) et archivable (fossile immuable) ;
- le transport réussi ne vaut plus preuve : seule la promotion par gate + `VERIFY` autorise le commit ;
- VFS + GPU deviennent le substrat d'expérimentation massif sans contester le verrou `.git/index.lock` ;
- la distinction Git-état / Git-workspace / génétique / fossile est opposable en revue.

Négatives :

- surcoût systématique (snapshot + forks + comparaison) même pour les petites transitions ; prévoir un mode `single-world` avec justification `counterfactualRef: null` ;
- `MemoryRouter/StrategyRouter` et le scoring GPU massif restent partiellement en stubs ; pas d'apprentissage inter-missions des poids dans cet ADR ;
- aucun QPU réel ni extension `ClinicalState` dans cet ADR (voir ADR suivantes : clinique/immunité, QPU-organe).

## Alternatives

- Laisser le planner appliquer sans commit parent : rejeté, histoire non auditable, rollback impossible.
- Réserver le contrefactuel aux topologies : rejeté, le même gate doit couvrir stratégie, DNA, plasmide, thérapie, allocation.
- Nommer le VFS `QuantumVFS` et parler d'effondrement : rejeté, anti-scientifique ; forks ≠ superposition, promotion ≠ mesure quantique.
- Fusionner Git-état et reproduction génétique en un seul `merge` : rejeté, confond intégration d'état et hérédité.
