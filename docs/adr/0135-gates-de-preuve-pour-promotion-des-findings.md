---
title: Evidence Gates for Daemon Finding Promotion
date: 2026-09-26
status: accepted
authors: Bruney
decision-id: 0135
---

# ADR 0135 : gates de preuve pour promouvoir les findings daemon

## Contexte

Le cycle de vie autorisait les transitions `SUPPORTED → REPRODUCED →
CAUSALLY_SUPPORTED → REPAIRABLE` sur la seule base de l'ordre des statuts. Une
transition vers `REPAIRABLE` ouvrait ensuite un épisode de réparation, même sans
preuve de réplication ou d'intervention contrôlée. Le Verifier actuel observe des
événements indépendants ; il ne réalise pas encore l'expérience causale complète
différée par ADR 0034/D9.

## Décision

`findingService.transitionFinding` applique maintenant les gates suivants avant
d'écrire un statut :

- `SUPPORTED` exige une preuve typée de soutien avec provenance ;
- `REPRODUCED` exige une preuve `replicated` avec au moins deux occurrences ;
- `CAUSALLY_SUPPORTED` et `REPAIRABLE` exigent une preuve `causal` qui référence
  deux snapshots persistés du workspace du territoire, un hash d'état initial,
  une intervention appliquée, un environnement identique, deux répétitions et
  un résultat qui diverge.

La mise en statut `REPAIRABLE` et l'ouverture idempotente de son épisode sont
exécutées dans la même transaction. L'échec d'ouverture annule la transition.
Un reçu déclaré par le caller n'est pas assimilé à une preuve causale : les
snapshots doivent exister et appartenir au workspace du territoire. Le Verifier
ne fabrique pas automatiquement ce reçu ; jusqu'à l'intégration de l'exécuteur
contrôlé, les promotions causales sans reçu sont refusées.

## Conséquences

- Une observation répétée ne peut plus, à elle seule, déclencher une réparation.
- Le workflow causal est fail-closed et reste en attente du runner contrôlé.
- Les callers qui promouvaient directement les statuts doivent joindre les
  preuves typées attendues.

## Alternatives

- Garder les transitions libres et laisser l'orchestrateur interpréter les
  statuts : rejeté, car un finding sans preuve atteignait le worker de réparation.
- Faire exécuter automatiquement une intervention par le daemon : rejeté, car
  le daemon observe et l'orchestrateur décide ; l'écriture reste sous lease worker.
