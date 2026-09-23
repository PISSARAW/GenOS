---
title: Systemes vitaux des agents 6-10
date: 2026-09-23
status: accepted
authors: GenOS
decision-id: 0039
---

# ADR 0039 : Systèmes vitaux des agents (6-10)

## Statut

- **Statut** : Accepté
- **Date** : 2026-09-23
- **Domaine** : Perception, métabolisme, résilience, développement, procédures
- **Décideurs** : GenOS
- **Lié à** : [0037](0037-ecosysteme-agentique-11-15.md), [0015](0015-convergence-organisme-cognitif-composite.md), [0013](0013-survival-model-control-plane.md)

## Contexte

Après les cinq premiers systèmes (cerveau cognitif : état épistémique,
mémoire, phénotype cognitif, stratégies, régulation), l'agent GenOS restait
un décideur désincarné : pas de perception active (les primitives
`echolocation_probe`, `foveal_scan` existaient comme stratégies isolées sans
organe de sélection), des budgets dispersés sans économie unifiée, une
collection de stratégies de survie sans enveloppe par agent, des workers
créés directement dans leur état définitif (`spawn worker(role=...)`), et un
runtime procédural avancé (24 mécanismes) non branché sur les agents.

## Décision

Ajouter cinq systèmes comme organes branchés sur la même boucle
morphogénétique (aucun nouveau silo) :

1. **Perception / action** : `perception/` (registre canonique de 9 capteurs,
   sensorium, observation canonique, attention par gain/coût, affordances,
   planification de probes, modèle d'environnement). Boucle
   observation → intégration → mise à jour épistémique → attention →
   affordances → action → receipt → observation.
2. **Métabolisme** : `metabolism/` (état métabolique unifié, ledger
   hiérarchique mission → toolcall où aucun enfant ne crée de ressource,
   réservation, allocation par utilité `EIG × pertinence × urgence × progrès /
   coût` avec verdicts GRANT/PARTIAL/DEFER/SUBSTITUTE/DENY, pression
   métabolique pilotant la morphogenèse, coûts substrat, politique de famine).
3. **Résilience** : `resilience/` (machine d'état
   HEALTHY → DEGRADED → CONTAINED → RECOVERING → VERIFYING → HEALTHY, plus
   DORMANT et TERMINAL → AUTOPSY → FOSSIL ; enveloppe de survie par
   agent/subgraph ; redondance adaptative ; dégradation plutôt que crash ;
   coordinateur de cryptobiose en façade du service existant). Médecine ≠
   résilience : continuer la mission malgré la panne.
4. **Développement** : `development/` (état développemental en 8 stades,
   différenciation sans modification du DNA, expression épigénétique,
   reprogrammation Yamanaka préservant identité/lignée/plafond d'autorité,
   régulateur de plasticité à 6 états avec hystérésis remplaçant l'Axolotl
   2 états, embryogenèse collective).
5. **Symbiontes procéduraux** : `proceduralSymbiont/` (le runtime procédural
   existant est référencé, pas réimplémenté ; résolveur avec autorité
   effective = procédure ∩ host ∩ lease ; compatibilité hôte/procédure
   apprise séparément ; propagation validée local → lineage_standard).

`AgentExpressionContext` porte les cinq nouveaux états
(`sensorium`, `metabolicState`, `resilienceEnvelope`,
`developmentalState`, `proceduralSymbionts`) et `MorphogenesisPlan`
s'étend à 14 dimensions avec receipt SHA (`morphogenesisPlanExtensions`).

## Conséquences

### Positives

- La morphogenèse devient cognitive, physiologique, développementale et
  procédurale, pas seulement organisationnelle.
- Chaque transformation reste explicable (receipts) et bornée par l'autorité
  (aucun organe n'amplifie une permission).
- Vérifié : `backend/tests/test_systems_6_10.js` (14 tests), gate qualité
  propre sur les 30 nouveaux fichiers, suites backend et procédurales vertes.

### Négatives

- Surface d'API élargie (~30 services) : discipline d'indexation requise.
- États en `Map` mémoire pour sensorium/résilience/développement :
  persistance durable à prévoir pour les populations massives.

## Alternatives

- **Cinq nouveaux silos indépendants** : écarté, aurait fragmenté la boucle
  de décision au lieu de l'unifier.
- **Réutilisation du registre MCP comme capteurs** : écarté, les outils MCP
  décrivent des actions, pas des qualités d'observation (coût, latence,
  qualité de preuve).
- **Statu quo (workers statiques + budgets dispersés)** : écarté, bloque la
  promesse d'organisme adaptatif de GenOS.
