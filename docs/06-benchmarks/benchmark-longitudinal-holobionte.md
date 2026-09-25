# Benchmark longitudinal Holobionte

- **Statut** : Protocole implémenté, campagne non exécutée
- **Portée** : comparaison appariée de douze stratégies sur 50 à 100 missions séquentielles
- **Dernière revue** : 2026-09-25

## Objectif

Évaluer si les capacités persistantes d’Holobionte apportent une différence mesurable face à des stratégies de référence et à des ablations. Le runner calcule des résumés descriptifs et n’autorise aucune promotion (`promotionDecision: null`).

## Bras comparés

Le service `backend/src/services/holobionte/benchmark/longitudinalBenchmarkService.js` attend les douze bras suivants :

1. `singleLlm`
2. `singleLlmTools`
3. `supervisorWorkers`
4. `aTeam`
5. `currentFourRoleHolobiont`
6. `staticResidentTools`
7. `persistentHostWithoutPartnerLearning`
8. `withoutImmuneAdmission`
9. `withoutResourceAdaptation`
10. `withoutTransmission`
11. `withoutDependencyControl`
12. `fullHolobiont`

Chaque bras doit traiter les mêmes identifiants de mission, dans le même ordre. Une campagne accepte de 50 à 100 missions distinctes. Le runner séquentiel appelle une fonction `runMission` injectable pour chaque couple mission/bras.

## Preuves et métriques

Chaque résultat fournit un état de succès, coût, nombre de jetons, identifiants de preuve et identifiant du vérificateur. Les métriques optionnelles couvrent le besoin et le réemploi des capacités, les admissions nuisibles, les faux positifs/négatifs immunitaires, le temps de remplacement et de reprise, la concentration de dépendance, la redondance fonctionnelle, la rétention verticale et les événements de dysbiose.

Les taux sans dénominateur sont rendus comme `null`. Les preuves sont conservées par bras dans le résumé. Le harness ne vérifie pas indépendamment la validité sémantique des références : la fonction de mission et les vérificateurs de campagne doivent fournir des résultats traçables.

## Exécution et état des résultats

Le service est un protocole de collecte et d’agrégation, pas une campagne exécutée. Les tests `backend/tests/test_holobiont_longitudinal_benchmark.js` utilisent un runner simulé pour vérifier l’ordre des missions, les douze bras, les métriques et le rejet d’entrées incomplètes. Aucun résultat expérimental réel ni comparaison de performance ne peut être déduit de ces tests.

Pour préparer une campagne, fournir 50 à 100 missions fixes et une implémentation `runMission` qui exécute effectivement chaque stratégie et attache des preuves vérifiables. Archiver l’entrée, les sorties par mission, la configuration des bras et l’identité des vérificateurs avec le rapport final.

## Limites

- La séquentialité et l’appariement des identifiants sont contrôlés ; l’équivalence de difficulté des missions et l’absence de biais d’ordre relèvent du protocole de campagne.
- Les noms des bras ne configurent pas eux-mêmes les topologies : `runMission` doit les réaliser correctement.
- Les agrégats sont descriptifs. Le runner ne calcule ni intervalles de confiance, ni test de significativité, ni décision de promotion.
- Une métrique absente reste absente ; il faut distinguer donnée manquante et valeur nulle lors de l’interprétation.

Voir également l’[ADR 0105](../adr/0105-benchmark-longitudinal-holobionte.md) et la [fiche Holobionte](../02-orchestration/topologies/holobionte.md).
