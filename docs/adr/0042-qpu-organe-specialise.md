---
title: QPU comme organe specialise et selection quantum-inspired
date: 2026-09-23
status: proposed
authors: GenOS
decision-id: 0042
---

# ADR 0042 : QPU comme organe spécialisé et sélection quantum-inspired

## Statut

- **Statut** : Proposé
- **Date** : 2026-09-23
- **Domaine** : Substrat de calcul, quantum-inspired, QPU, GPU, VFS
- **Décideurs** : GenOS
- **Lié à** : [0040](0040-morphogenese-git-contrefactuel.md), [0041](0041-medecine-immunite-graduee.md)

## Contexte

Aucun calcul quantique réel n'existe dans le dépôt : recherche `qiskit|cirq|pennylane` vide ; `computeSubstrateResolver.js` déclare `qpu: {operationTypes: [quantum_circuit, superposition_sample, entanglement_ops]}` sans exécuteur ; `migrateComputeSubstrates.js` et `067-compute-substrates` persistent le registre ; `advanced.rs:115` et `swe_eval_engine.js:6` rappellent que les IDs `quantum-world` sont de la compatibilité classique. La doctrine est déjà écrite (`workspaces-contrefactuel.md:579-583`, ADR 0040 §12-13) : `CounterfactualVFS` classique, `quantum-inspired selection` comme analogie, QPU réservé à un circuit explicite. Il reste à sceller le statut du QPU et les règles d'usage du quantum-inspired pour empêcher toute régression marketing (`VFS quantique`, `worker sur QPU`, `effondrement`).

## Décision

1. **Deux régimes séparés, vocabulaire opposable.** `quantum-inspired` = invariants mathématiques exécutés classiquement : ensemble de futurs ouverts (`CandidateState{F1..Fn}` en capsules `CounterfactualVFS` CoW), sélection par gate d'évidence (`compareEffects/promoteWinner`, ADR 0040), interactions constructives/destructives entre hypothèses — jamais `superposition physique`, `effondrement`, ni `QuantumVFS` (alias historiques `quantum-world`, `sandbox-backend: quantum` conservés pour compatibilité, documentés comme classiques). `QPU backend` = exécution réelle d'un circuit sur simulateur/QPU via backend explicite (Qiskit/Cirq/PennyLane ou équivalent), avec preuve du backend dans le receipt.
2. **QPU = organe spécialisé appelé par un agent, au même rang que `SAT solver, Lean, GPU kernel`.** Appels admissibles : optimisation, échantillonnage, recherche, chimie quantique, algèbre linéaire adaptée — jamais `mettre un worker/LLM sur QPU`. Routage via `computeSubstrateResolver.resolve({type: quantum_circuit, ...})` ; tout autre type routé vers `qpu` = rejet. Sans backend QPU configuré, `qpu` est indisponible (pas de fallback silencieux vers CPU : verdict `dégradé` explicite).
3. **Le planner choisit le matériel.** `MorphogenesisPlan.executionSubstrate` annote chaque étape (`planner: cpu, candidateSimulation: gpu, counterfactualWorlds: vfs_workers, quantumSearch: none|qpu`) via `annotatePlanWithSubstrates` ; GPU = scoring massif parallèle (embeddings, populations évolutionnaires, évaluation contrefactuelle), VFS = 100 mondes isolés par deltas, CPU/solver = diffs unitaires et preuves SAT exactes. Chaque promotion committée (ADR 0040) enregistre le substrat utilisé dans `evidence_json`.

## Conséquences

Positives :

- crédibilité scientifique : aucune prétention quantique sans backend prouvé ;
- le quantum-inspired reste utile sans QPU (recherche massive d'espaces de possibilités sur GPU/VFS) ;
- un futur backend QPU réel se branche sans changer le cycle (un substrat de plus, mêmes gates).

Négatives :

- pas de QPU réel dans cet ADR : `qpu` reste un type routable sans exécuteur, toute tentative d'exécution doit échouer explicitement plutôt que simuler silencieusement ;
- surcoût de revue : chaque usage du mot `quantique` dans docs/code doit passer le filtre (analogie nommée vs backend prouvé).

## Alternatives

- Renommer le VFS en `QuantumVFS` : rejeté, anti-scientifique (forks ≠ superposition).
- Exécuter des workers LLM sur QPU : rejeté, les QPU généralistes actuels ne le permettent pas.
- Mettre le quantique avant Git + contrefactuel + VFS + preuves : rejeté, couche spectaculaire non validable (ordre ADR 0040 → 0041 → 0042).
