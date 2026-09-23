---
title: Ecosysteme agentique 11-15
date: 2026-09-23
status: accepted
authors: GenOS
decision-id: 0037
---

# ADR 0037 : Écosystème agentique (11-15)

## Contexte

GenOS v3 possède niches procédurales, routage modèles, CRDT/stigmergie/quorum,
gouvernance par approbations hashées et télémétrie/SPI. Ces éléments ne pilotent
pas encore directement la morphogenèse comme variables de contrôle.

## Décision

Ajouter cinq systèmes comme organes de base :

1. Environnement et niches : `environmentModelService`, `nicheResolverService`.
   Fitness toujours relative à une niche. Dérive `ENVIRONMENT_DRIFT` détectée.
   Construction de niche explicite et soumise à autorité.
2. Substrat cognitif : `hostRuntimeIdentityService`,
   `cognitiveSubstrateResolverService`. Agent != LLM. Native-first sauf
   politique/demande contraire. `requestedModel` != `servedModel` tracés.
   Modèle puissant != autorité supérieure.
3. Physiologie collective : `collectivePhysiologyService`,
   `informationFlowResolverService`. Topologie != physiologie. Quorum pondéré
   par compétence/indépendance/calibration, jamais vérité. Routage ciblée,
   pas broadcast permanent.
4. Gouvernance : `governancePlaneService` orthogonal à l'intelligence.
   `APPROVE / DENY / BOUNDED_APPROVE / HUMAN_REVIEW`. Morphogenèse à impact
   validée avant commit. `assertMember()` ne crée plus de membre implicite :
   `UNKNOWN_AGENT -> DENY`, incarnation explicite requise.
5. Interoception collective : `collectiveInteroceptionService`. Vital signs
   multidimensionnels, pas de score unique. Télémétrie manquante = incertitude
   (`unknown / partially observed`), jamais `no anomalies`.

## Invariants

- Fitness relative à une niche.
- Changer l'environnement est une action gouvernée.
- LLM != agent ; frontier != vérité ; quorum != vérité.
- Hôte natif par défaut (Codex/Hermes/Claude/OpenCode...).
- Relation ne donne jamais permission ; inconnu jamais membre.
- Human approval = autorisation, pas preuve.
- Absence de télémétrie != absence de problème.
- Santé multidimensionnelle ; monoculture cognitive détectée.

## Contrats

`spec/ecosystem-11-15.schema.json` : EnvironmentState, Niche,
CognitiveSubstrateDecision, CollectivePhysiology, GovernanceContext,
CollectiveHealthState.

## Conséquences

Morphogenesis devient kernel décisionnel composé de résolveurs, mais ne décide
jamais seul : gate gouvernance obligatoire, traçabilité requested/served,
rollback et dossier compact pour l'humain.
