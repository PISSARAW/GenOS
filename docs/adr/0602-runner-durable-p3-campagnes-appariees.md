# ADR 0602 — Runner durable P3 pour les campagnes appariées

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : morphogenèse, expérimentation, durabilité, interopérabilité
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0573, `benchmarks/topology-morphogenesis/p2-protocol.json`

## Contexte

La porte P2 sait refuser une campagne incomplète, non appariée, contaminée par
le shadow ou dépourvue de provenance externe. Elle ne produisait cependant pas
elle-même les observations : aucun contrat d'exécution commun ne reliait encore
les six bras à des processus réels, et une interruption pouvait conduire à
rejouer une tentative ou à perdre sa comptabilité.

Les frameworks rivaux ne sont pas des dépendances du monorepo. Les simuler avec
des implémentations locales créerait une comparaison trompeuse. À l'inverse,
exécuter une commande shell libre depuis un dataset compromettrait le confinement
et la reproductibilité.

## Décision

P3 introduit un runner séquentiel et durable avec les règles suivantes :

1. chaque tentative reçoit un identifiant déterministe dérivé de la campagne,
   du split, de la tâche, de la seed et du bras ;
2. un bail exclusif précède l'exécution et peut être repris après expiration ;
3. le même identifiant est transmis comme clé d'idempotence à l'adaptateur ;
4. un reçu terminal est écrit atomiquement, hashé et ne peut pas être rejoué ;
5. le split shadow doit être complet et scellé avant toute exécution holdout ;
6. la requête adaptateur omet le split, le dataset, l'identité de tâche et
   l'oracle afin de ne pas fournir ces signaux au sélecteur ;
7. les adaptateurs sont des processus lancés sans shell, avec hash vérifié de
   l'exécutable et de l'artefact ;
8. LangGraph, AutoGen et MASS/EvoMAS exigent un reçu `native-framework`, une
   version d'adaptateur et une provenance `external-paired` ;
9. une fixture porte explicitement `test-fixture`, entraîne
   `realExecution: false` et ne peut pas qualifier la campagne ;
10. le résultat P3 reste une preuve : il n'accorde aucune autorité de commit,
    d'exécution ou de promotion.

Le dépôt fournit le protocole de processus et le runner, mais pas de faux
wrappers concurrents. Une installation opérateur doit fournir les artefacts
réels, leurs empreintes, les corpus scellés et les oracles indépendants.

## Conséquences

### Positives

- une campagne interrompue reprend sans réexécuter les reçus terminaux ;
- les échecs et coûts restent comptabilisés au lieu d'être effacés ;
- le holdout ne peut pas démarrer avant le scellement du shadow ;
- un même protocole accueille des runtimes locaux et des frameworks externes ;
- les fixtures valident le mécanisme sans être confondues avec une preuve réelle.

### Négatives

- l'idempotence après crash dépend aussi du respect de la clé par l'adaptateur ;
- les exécutables et artefacts doivent être distribués et hashés hors du dépôt ;
- P3 ne supprime pas le besoin d'un environnement isolé pour les frameworks ;
- aucune supériorité comparative n'est établie tant que la campagne réelle
  shadow puis holdout n'a pas été exécutée.

## Alternatives

- **Intégrer des simulations locales des rivaux** : rejeté, car elles ne
  constitueraient pas une exécution LangGraph, AutoGen ou MASS/EvoMAS.
- **Écrire uniquement le résultat final de campagne** : rejeté, car une panne
  perdrait les tentatives et favoriserait les reruns sélectifs.
- **Passer le dataset et l'oracle aux adaptateurs** : rejeté, car ces signaux
  augmenteraient le risque de fuite du holdout.
- **Promouvoir automatiquement après la statistique** : rejeté, car la preuve
  ne confère pas l'autorité runtime.
