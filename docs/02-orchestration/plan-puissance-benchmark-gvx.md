# Plan de puissance pour les benchmarks GVX

`gvxBenchmarkProtocol` exige un `analysisPlan` (`primaryMetric`, `direction`) et un
`powerPlan` (`minimumEffectOfInterest`, `assumedStdDev`, `confidenceLevel`, `power`). Le
manifeste dérive `requiredReplicates` avec une approximation normale pour deux groupes
indépendants. Ce nombre borne les seeds requises par variante, cohorte et split train ou
holdout.

Les hypothèses de variance et d'effet doivent venir d'un pilote ou de données publiées dans
le manifeste de campagne. Le protocole conserve `comparisonAuthority: none` : le calcul du
nombre de runs et le résumé descriptif n'autorisent aucune revendication de supériorité.

`backend/src/services/gvxBenchmarkRunner.js` fournit l'exécution séquentielle d'une
campagne préenregistrée : variantes, cohortes, splits et seeds dérivés du plan, vérification
des hashes train/holdout, budget par run, reçus de métriques signés par le control plane,
validation de couverture, puis relecture et hash des artefacts de run et de synthèse.
Chaque vérificateur métier doit lier `metric`, `variant`, `cohort`, `split`, `seed`, hash du
jeu, modèle, outil et valeur mesurée dans sa décision signée. Un résultat incomplet est
rejeté sans synthèse `measured`.

Le point d'entrée opérateur est `node backend/bin/genos-gvx-benchmark.cjs`. Il charge un
module d'adaptateurs via `GENOS_GVX_BENCHMARK_ADAPTER_MODULE` et vérifie son SHA-256 fourni
par `GENOS_GVX_BENCHMARK_ADAPTER_SHA256` avant de l'importer. Le module exporte
`createCampaign({ signal })`, qui retourne le manifeste créé par `gvxBenchmarkProtocol`,
les runners par variante, les lecteurs de datasets et d'artefacts, ainsi qu'un registre de
vérification distant créé par `gvxVerifierRegistry.fromRemoteControlPlane`. Le module
configure également l'URL, la clé publique, le jeton du vérificateur, les IDs approuvés,
et les adaptateurs de stockage. Les handlers SIGINT/SIGTERM annulent le cycle; chaque run
reste séquentiel et borné par `maxRuns` (10 000 par défaut).

Le déploiement doit provisionner les credentials hors du manifeste et du dépôt. Le hash
épingle le code d'adaptateur, mais l'opérateur doit protéger la configuration, l'accès aux
datasets, le registre de confiance et les clés du service de vérification. Le coût rapporté
par un runner est contrôlé après son retour; l'adaptateur d'exécution doit aussi appliquer
le budget au cours du run.

Au 2026-10-06, les baselines MBH-like/Lipson-like ne sont pas implémentées dans les
protocoles GVX et aucune campagne GVX holdout n'a été exécutée. Le dépôt contient une
campagne AGOW locale sur données synthétiques, sans holdout métier indépendant; elle ne
fournit pas un pilote représentatif pour paramétrer la puissance GVX. Aucun manifeste
qualifié, jeu GVX train/holdout ni vérificateur de métriques de campagne n'est configuré ; le runner
n'a donc pas été lancé et l'état reste `not_run`. Avant exécution,
chaque campagne doit fournir les jeux train/holdout séparés, l'origine et le hash des
données, les modèles/outils et versions, le seed, les commandes, les budgets, ainsi que les
hypothèses d'effet et de variance. Les résultats doivent publier les intervalles,
exclusions et écarts au protocole; à défaut, l'état reste `not_run`.

Les [profils standard AGOW](profil-execution-gvx.md) disposent de vérificateurs de mesures exécutées pour leur cycle somatique. Ils ne fournissent pas automatiquement les contrats de métriques, datasets et runners d’une campagne GVX. La [suite fonctionnelle](../06-qualite-preuves/validation-cycle-standard-gvx.md) exécutée au commit `ac3423cb` valide reprise, rollback et preuves ; elle ne remplace pas les comparaisons train/holdout. La campagne reste différée pour privilégier l’implémentation.

Voir [ADR 0266](../adr/0266-plan-puissance-benchmarks-gvx.md) et
[ADR 0275](../adr/0275-execution-campagne-gvx.md).
