# Lot suites racine — procéduraux, orphelins, bibliothèques

Statut : enquête 2026-09-27, méthode `audit_service_reachability.js` + `rg` prod/tests + exécution des suites.
Correction au lot précédent : `authorityMatrixService` (racine) n'est pas orpheline — `test_adr_0044_gates.js:6` l'exerce.
Les orphelins stricts sont donc **6**, pas 7 ; les bibliothèques **10**, pas 11 (`conceptRegistryService` rejoint les orphelins).

## 1. Procéduraux ×14 : test-only, chaînage manquant côté appelant

`ActionSelection, Apoptosis, BiomePopulation, Cryptobiosis, EcologicalDiversity, EcologicalNiche, Epigenetic,
Fossilization, Holobionte, HomeostaticPlasticity, Inhibition, LearningCycle, Methylation, Pruning` — prédicats purs
et marqueurs (ex. `shouldApoptose/apoptose/isApoptotic`), zéro appelant prod : `proceduralRuntimeService.js` ne requiert
aucun des 14 (vérifié par `rg`). Suites relancées le 2026-09-27 : `foundations`, `9_12`, `13_24`, `learning_cycle`
(dont intégrité des reçus) → toutes passées.
Refus : pattern fail-soft (`0/null/false` sur entrée invalide, ex. `scoreForNiche`), pas de rejet dur — à durcir si un
appelant organisme voit le jour. Statut proposé : `bibliothèque`. Le trou causal n'est pas dans ces fichiers mais dans
l'appelantruntime inexistant : aucun câblage artificiel ajouté. Aucun changement de la matrice (liens possibles §7/§9
non prouvés).

## 2. `authorityMatrixService` (racine) : test-only avec refus

Exercée par `test_adr_0044_gates.js` (relancé : passé) : `resolveCanonical/can/validateAction`, refus `unknown → null/false`.
Zéro appelant prod — l'homonyme actif est `aTeam/responsibility/authorityMatrixService.js` (553 octets) via
`boundaryPolicyService.js:3`. Statut proposé : `bibliothèque`, avec homonymie à résoudre (lot aTeam à venir).

## 3. Orphelins stricts (6) : consomment le cœur, rien ne les consomme

| Fichier | Rôle | Statut proposé |
|---|---|---|
| `proceduralNicheScoringService` (79 l.) | `scoreForNiche/findBestNiche`, dépend de `proceduralIdentityService`, sans test | `expérimental` (exige test + appelant sélection) |
| `orchestrationAuditService` (213 l.) | audit `computeAvailable/computeConsidered` sur capabilityGraph, dépend de `topologyCapabilityService` | `expérimental` |
| `topologyFinalizationService` (65 l.) | `finalizeTopology`, refus par défaut `blocked` si audit incomplet, persistance SQLite | `expérimental` (refus par défaut noté, test à écrire) |
| `poetBridgeService` (94 l.) | pont entre `poetExecutionEngine` et `environmentGeneratorService` (tous deux existants) | `expérimental` |
| `phenotypicPersistence` (73 l.) | `savePhenotypeState` vers table réelle `agent_phenotype_states` (`db/migrations/registry.js:89`) | `expérimental` |
| `conceptRegistryService` (364 l.) | docblock « single source of truth », mais rôle tenu par `philosophy/conceptRegistry` (actif via routeur) | `obsolète`, candidat retrait sur décision ADR — seul fichier du lot avec duplication avérée |

## 4. Bibliothèques (10) : statut confirmé par tests verts

`boundedGossip, gapJunction, globalWorkspace, perceptiveBinding, validationProtocol, fitnessParetoDestiny,
morphogenesisBenchmark, morphogeneticPopulation, interMissionConsolidation, metacognitiveBeliefAction` —
10/10 suites passées le 2026-09-27, zéro appelant prod. Statut : `bibliothèque`, à garder et documenter comme telles.
