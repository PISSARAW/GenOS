# Protocole proposé pour le soak E09

**Statut : préparé, soak final non exécuté.** E04 modifie encore le manifeste public; lancer la mesure avant stabilisation ferait référence à une version obsolète du corpus. Le runner actuel conserve son chemin de charge standard et ajoute un mode `--soak-cycles` séparé.

Après stabilisation du manifeste E04, lancer depuis la racine :

```powershell
node benchmarks/omega-bench-2026/src/run_e09_load.cjs --soak-cycles=12 --output=benchmarks/omega-bench-2026/results/E09-soak.json
```

Le mode soak exécute 12 cycles successifs de 10 000 invocations asynchrones, soit 120 000 invocations dans un seul processus Node. Chaque cycle consigne le RSS et le heap avant/après, le maximum échantillonné toutes les 10 ms pendant la charge, ainsi que le high-water RSS fourni par Node avant/après le cycle. Le manifeste final contient le hash du manifeste de données, le hash du runner, les mesures par cycle et l'évaluation descriptive ci-dessous. Le chemin standard, sans `--soak-cycles`, ne fait pas le soak.

## Règle de lecture fixée avant le run

Le premier cycle est traité comme échauffement. Pour RSS et heap séparément, comparer la médiane des trois mesures `after` des cycles 2–4 à celle des trois derniers cycles. Signaler `growth_signal` si la différence dépasse **16 MiB pour RSS** ou **8 MiB pour heap**; sinon rapporter `no_growth_signal_under_rule`. Ces seuils sont des détecteurs d'évolution pratique dans ce banc, pas des limites d'acceptation, des intervalles de confiance ou une preuve d'absence de fuite. Il faut lire les séries par cycle avec les maxima échantillonnés et les high-water RSS, sans résumer l'observation à la seule classification.

Une absence de signal signifie uniquement que ce test n'a pas franchi les seuils dans cette fenêtre et sur cet hôte. Une hausse peut refléter une fuite, l'allocateur, le ramasse-miettes ou les conditions de l'hôte partagé; elle appelle une investigation, mais ne permet pas seule de conclure à une fuite. Le high-water RSS est cumulatif au niveau du processus et le pic échantillonné peut manquer un maximum bref. Les instantanés `heapUsed` varient avec le ramasse-miettes; aucune collecte forcée n'est activée.

Cette charge mesure des invocations concurrentes du runner au sein d'un processus unique, avec des instances de runtime construites par invocation. Elle ne mesure ni des processus agents OS, ni une instance GenOS de production, ni la mémoire des fournisseurs externes. Elle ne peut établir une borne mathématique ni une borne mémoire de production. L'exécution finale reste à effectuer après que le manifeste E04 est figé; les valeurs de résultats ne sont donc pas encore disponibles.
