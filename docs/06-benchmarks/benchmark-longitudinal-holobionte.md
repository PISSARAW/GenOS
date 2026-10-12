# Benchmark longitudinal Holobionte

- **Statut** : Runner réel et journal reprenable implémentés; campagne non exécutée
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

Le service d’agrégation est accompagné d’une commande opérateur réelle :
`node backend/bin/genos-holobiont-benchmark.cjs --manifest <fichier.json> --output <rapport.json> --journal <runs.jsonl>`.
Elle exige un adaptateur applicatif explicitement configuré et épinglé par SHA-256 dans
`GENOS_HOLOBIONT_BENCHMARK_ADAPTER_MODULE` et
`GENOS_HOLOBIONT_BENCHMARK_ADAPTER_SHA256`. L’adaptateur doit implémenter les douze
bras séparément et renvoyer, pour chaque couple bras/mission, les coûts, tokens,
références de preuve, vérificateur et reçu d’exécution réel (`runId`, exécuteur,
statut, références et vérificateur concordants). Le runner refuse une campagne
incomplète, une preuve absente, un reçu incohérent ou une mission hors ordre.

Le module adaptateur exporte `createCampaign({ manifest, signal, campaignId })` et
renvoie `{ benchmarkId, armAdapters }`, avec une fonction `armAdapters[arm]({ arm,
mission, sequence, remainingBudget, signal, benchmarkId })` pour chaque bras. Chaque résultat contient
`missionId`, `success`, `cost`, `tokens`, `evidenceRefs`, `verifierId` et
`runtimeReceipt: { runId, executor, status, evidenceRefs, verifierId }`. Un échec de
tâche (`success: false`) peut avoir un reçu d’exécution `status: "completed"`; ces deux
états sont distincts. Une exception d’exécution interrompt le run sans effacer le
journal partiel.

Le manifeste fournit `benchmarkId`, 50 à 100 missions distinctes et un budget positif
`budget.maxCost`, `budget.maxTokens`, `budget.maxTimeMs`. Chaque exécution est ajoutée
au journal JSONL synchronisé; `--resume` reprend uniquement si l’empreinte du manifeste,
de l’adaptateur, l’identifiant et le budget correspondent. `SIGINT`/`SIGTERM` transmettent
un signal d’arrêt à l’adaptateur, et le journal partiel reste disponible. Le rapport
final est écrit atomiquement et ne contient aucune décision de promotion.

Cette infrastructure n’est pas une campagne terminée : aucun adaptateur spécifique
aux douze bras n’est configuré dans le dépôt. L’adaptateur reste responsable du vrai
routage vers les exécuteurs, de la mise en œuvre des ablations et de la collecte des
preuves. Le reçu requis est un contrat de traçabilité fourni par l’adaptateur; le runner
ne vérifie pas cryptographiquement l’indépendance du vérificateur ni la validité
sémantique de chaque référence. Le rapport d’une campagne ne doit donc être interprété
qu’avec les artefacts, le code d’adaptateur et les preuves archivés.

Pour exécuter une campagne, préparer le manifeste, les douze adaptateurs et les moyens
d’exécution/vérification requis, puis lancer la commande ci-dessus. Archiver le manifeste,
le journal, le rapport, le code d’adaptateur épinglé et les artefacts de preuve.

## Limites

- La séquentialité et l’appariement des identifiants sont contrôlés ; l’équivalence de difficulté des missions et l’absence de biais d’ordre relèvent du protocole de campagne.
- Les noms des bras ne configurent pas eux-mêmes les topologies : `runMission` doit les réaliser correctement.
- Les agrégats sont descriptifs. Le runner ne calcule ni intervalles de confiance, ni test de significativité, ni décision de promotion.
- Une métrique absente reste absente ; il faut distinguer donnée manquante et valeur nulle lors de l’interprétation.

Voir également l’[ADR 0105](../adr/0105-benchmark-longitudinal-holobionte.md) et la [fiche Holobionte](../02-orchestration/topologies/holobionte.md).
