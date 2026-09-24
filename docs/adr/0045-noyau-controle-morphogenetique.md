---
title: Noyau de contrôle morphogénétique de l'orchestrateur Rust
date: 2026-09-24
status: proposed
authors: GenOS
decision-id: 0045
---

# ADR 0045 : Noyau de contrôle morphogénétique de l'orchestrateur Rust

## Statut

- **Statut** : Proposé
- **Date** : 2026-09-24
- **Domaine** : Orchestration, morphogenèse, gouvernance, incarnation, santé collective
- **Décideurs** : GenOS
- **Lié à** : [0038](0038-boucle-controle-cognitif-morphogenese.md), [0040](0040-morphogenese-git-contrefactuel.md), [0043](0043-runtime-worker-phenotypes.md), [0044](0044-matrice-autorite-gates-double-runtime.md), [../02-orchestration/noyau-controle-morphogenetique.md](../02-orchestration/noyau-controle-morphogenetique.md)

## Contexte

L'orchestrateur Rust (`crates/genos-orchestrator`) coordonnait les tissus
cellulaires, la sporulation et l'anti-collusion, mais n'avait pas de modèle
explicite de l'état global : pas de diagnostic causal avant changement de
topologie, pas de plan morphogénétique inspectable, pas de point unique de
création des workers, pas de niveaux d'autonomie vérifiables, pas de
gouvernance pré-application ni d'hystérésis contre le flapping
morphologique. Les changements collectifs restaient implicites et difficiles
à expliquer, versionner ou annuler.

## Décision

Refondre l'orchestrateur en **système nerveux central + kernel de contrôle**
(`crates/genos-orchestrator/src/kernel_*`), qui ne résout plus le problème
lui-même mais construit et régule le collectif qui le résout :

- `kernel_state` : `OrchestratorState` (mission, environnement, collectif et
  sous-graphes, épistémique, ressources, cognition, capacités, procédures,
  modèles, gouvernance, résilience, historique) alimenté par observations
  structurées, jamais par polling LLM ;
- `kernel_diagnosis` : classification causale (`Epistemic, Cognitive,
  Strategic, Capability, Model, Resource, Communication, Topology,
  Procedural, Pathological, Environmental`) avant tout changement ;
- `kernel_resolvers` : les résolveurs n'émettent que des `Proposal`
  (gain, coût), jamais d'action immédiate ;
- `kernel_morphogenesis` : `MorphogenesisPlan` explicable avec rollback,
  `NO_CHANGE` possible et hystérésis (gain minimal, cooldown, budget de
  transition) ;
- `kernel_incarnation` : `AgentIncarnationService` point unique de création,
  4 niveaux d'autonomie (`ScoutCell, AdaptiveWorker, SubOrchestrator,
  PrincipalOrchestrator`), enveloppes de sous-orchestrateurs ;
- `kernel_governance` : pipeline Resolver → Proposition → Plan → Validation
  → Gouvernance → Snapshot → Exécution → Reçu ; refus en mode dégradé,
  risque élevé ou autorité insuffisante ;
- `kernel_cycle` : boucle OBSERVE → REEVALUATE (`ControlKernel::step`),
  santé collective, diversité, commits AgentGit, `MissionReport`.

## Conséquences

Positives :

- tout changement collectif est explicable, versionné et annulable ;
- aucun worker bricolé hors du point d'incarnation unique ;
- aucun changement de topologie sans diagnostic puis gouvernance ;
- le gate qualité tient : 0 violation sur les nouveaux fichiers,
  6/6 tests `kernel_control` OK.

Négatives :

- les résolveurs sont déterministes à règles, pas branchés sur les
  registres GenOS (`Concept Registry`, `Capability Graph`) ni sur un LLM ;
- pas d'évaluation contrefactuelle live avant changement coûteux
  (comparaison F0/F1/FN prévue, non câblée au moteur VFS) ;
- pas de délégation live vers des sous-orchestrateurs (enveloppes seules) ;
- topologies composites multi-domaines décrites mais non exécutées ;
- `BiomimeticOrchestrator` historique conservé : deux modèles coexistent
  en attendant convergence.

## Alternatives

- Gros prompt orchestrateur unique : rejeté, mélange les questions
  épistémique, cognitive, organisationnelle et métabolique sans arbitre.
- Réflexes naïfs (`échec → plus de workers`) : rejetés, interdits par le
  diagnostic causal obligatoire.
- Statu quo du `BiomimeticOrchestrator` : rejeté, changements implicites
  non versionnés.
