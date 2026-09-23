---
title: Boucle de contrôle cognitif de la morphogenèse
date: 2026-09-23
status: accepted
authors: GenOS
decision-id: 0038
---

# ADR 0038 : Boucle de contrôle cognitif de la morphogenèse

## Contexte

GenOS dispose des cinq briques (état épistémique, mémoire, clés cognitives,
stratégies, drives/régulation) mais le planificateur de morphogenèse ne les
consommait pas : le choix de topologie dépendait de `mission + capabilities +
budget`, et la fermeture post-action n'alimentait pas le régulateur. De plus,
`buildContracts` appelait `missingCapabilities` avec les arguments inversés,
ce qui faisait échouer la planification dès que `currentState.agents` était une
`Map`.

## Décision

Fermer les cinq systèmes dans une seule boucle causale runtime :

- `cognitiveControlLoopService.decideMorphology({expression, candidates})`
  score les candidates `{courante, proposée, trinity}` via pression épistémique,
  réutilisation mémoire, poids régulateurs (modulation seule), fits cognitif /
  stratégique et biais topologique, et émet un receipt `MORPHOGENESIS_DECISION` ;
- `regulatoryBridgeService` expose le contrat unique `RegulatorySnapshot`
  (spec, révision CAS) et `applyRpe` (dopamine/cortisol/stress bornés) ;
- `planMorphogenesis` délègue le choix quand `ctx.expression` est présent
  (`plan.selectedTopology`, `plan.controlReceipt`), sinon comportement historique ;
- `AgentExpressionContext` charge l'état épistémique réel et le snapshot réel
  avec fallback (littéraux déplacés dans `agentExpressionContextContracts`
  pour tenir le gate CC <= 10) ;
- `causalLoopService.processActionReceipt` applique le RPE au régulateur ;
- corriger l'ordre des arguments de `missingCapabilities` (`(contrat, disponibles)`).

## Conséquences

Positives :

- la morphologie dépend de l'état de connaissance, de la mémoire, de la
  cognition, de la stratégie et de la physiologie ;
- chaque décision est inspectable (receipt : cause, mémoire, poids, score,
  alternatives) ;
- invariants tenus : hormones = modulation, curiosité ne bypass jamais un gate,
  mémoire ≠ vérité.

Négatives :

- `MemoryRouter`, `StrategyResolver`, `PhenotypeResolver` restent en stubs
  enrichis dans l'expression (pas d'appel live) ;
- pas d'apprentissage inter-missions des poids.

## Alternatives

- Laisser le planner indépendant des 5 états : rejeté, la morphogenèse restait
  aveugle à l'incertitude et aux contradictions.
- Multiplier les bridges ad hoc par hormone : rejeté, remplacé par le contrat
  unique versionné.
