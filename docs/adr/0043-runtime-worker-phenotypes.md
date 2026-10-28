---
title: Runtime Worker Commun et Phenotypes Composables
date: 2026-09-24
status: accepted
authors: GenOS
decision-id: 0043
---

# ADR 0043 : Runtime Worker Commun et Phenotypes Composables

> **État d'implémentation (2026-10-28)** — Cette ADR conserve la décision
> d'architecture initiale. Aujourd'hui, les workers exécutables sont lancés et
> supervisés par le backend Node.js. `crates/genos-worker` fournit des contrats,
> presets, dossiers et primitives de cycle Rust qui ne sont pas raccordés au
> dispatch actif. Voir la [référence des types de workers](../03-reference/types-de-workers.md).

## Contexte

Les workers GenOS (scout, executeur, verifieur, daemon, sub-orchestrateur...)
risquaient de devenir 20 implementations bricolees independantes, chacune avec
son propre cycle, son propre contrat et ses propres regles d'autorite. Cela
viole l'invariant biomimetique : **un meme genome, des phenotypes differencies**.

## Decision

Introduire le crate `genos-worker` comme **unique runtime worker** :

- `contract` : `WorkerRuntimeContract` commun (identite, mission, niche,
  cognition, strategie, capacites, autorite, lease d'outils, memoire,
  communication, ressources, evidence, resilience, cycle de vie).
- `phenotype` : `AgentPhenotype` composable (persistance, cognition, role
  epistemique, specialisation, role organisationnel, adaptation, delegation,
  spawn, memoire, communication, autorite) + `WorkerKind` (19 types) ranges en
  5 familles (sensory, execution, epistemic, adaptive/repair, organizational).
- `cycle` : cycle universel partage (INCARNATE -> ... -> ACT -> EVIDENCE ->
  REVIEW -> CONTINUE / ADAPT / ESCALATE / TERMINATE) avec changements de
  strategie/cognition bornes et budgets epuissables.
- `dossier` : le parent consomme un `WorkerDossier` type (claims, artefacts,
  tests, receipts, provenance, incertitudes) + artefacts specialises
  (`ScoutObservation`, `VerificationReport` ternaire Accept/Reject/Unresolved,
  `CreativeCandidate` non promouvable directement, `ClinicalReport`).
- `presets` : fabriques par phenotype remplissant differemment le meme contrat
  (`preset_for`). Le type de worker n'est jamais le nom du modele LLM.
- `invariants` : les 20 regles universelles sont enforcees par `check_action`
  (pas d'auto-augmentation d'autorite, lease courant seul, spawn explicite,
  scope borne, receipt obligatoire, succes = preuves + provenance).

## Consequences

- Tout nouveau type de worker = un phenotype + un preset, pas une classe.
- `niche_fit` + `dedifferentiate` gerent la plasticite des specialistes.
- Le verifier reste epistemiquement independant (verdict UNRESOLVED possible).
- Le sub-orchestrateur opere sous plafond d'autorite, sans modifier la
  mission parente ni les sous-graphes freres.
