# GenOS Benchmark Fleet

Ce workspace contient un portefeuille de benchmarks, un backlog priorisé, une
fleet d'agents spécialisés et un orchestrateur de recrutement.

## Audit indépendant des tâches assignées

Après production des rapports B02, B03, B09, B06, B07, B10 et B08, exécuter
l'auditeur de preuves :

~~~bash
node benchmarks/audit-results.mjs
~~~

L'auditeur vérifie les identités de tâche, les empreintes des sources et des
logs, les codes de sortie, les limitations déclarées et les gates externes. Il
écrit `benchmarks/results/evidence-audit-report.json`. Seules les affirmations
internes précisément mesurées peuvent être approuvées avec limitations ; les
scores publics et les classements comparatifs restent bloqués tant que leurs
datasets, runtimes, conditions identiques et approbations humaines manquent.

## Lancer l'orchestrateur

Depuis la racine du dépôt :

~~~bash
./benchmarks/run-fleet.sh
~~~

L'orchestrateur :

1. initialise benchmarks/workspace/.genos ;
2. crée un génome GenOS pour chaque agent ;
3. mute les drives selon la calibration du profil ;
4. lit portfolio.json et backlog.json ;
5. classe les agents par adéquation aux capacités requises ;
6. affecte les deux meilleurs agents à chaque tâche ;
7. écrit un plan d'exécution et une trace d'affectation.

Les résultats sont écrits sous benchmarks/workspace/runs/. Le dernier run est
référencé par benchmarks/workspace/latest-run.json.

## Exécuter les tâches B02 et B05

Le runner spécialisé exécute les preuves d'isolation et de sécurité MCP sans
contacter de service externe :

~~~bash
./benchmarks/run-tasks.sh B02 B05
~~~

Il produit `isolation-boundary-report.json` et `mcp-safety-report.json` dans
`benchmarks/results/`. Chaque rapport
contient les commandes exactes, leurs sorties et empreintes, les métadonnées de
la machine et les limites déclarées. Un répertoire de sortie explicite peut être
fourni avec `--output-dir PATH`.

B02 ne transforme pas une capacité absente en score nul : le provider de
répertoires garantit l'isolation des fichiers via l'API world, mais l'isolation
OS des processus et la politique réseau restent `unsupported`. B05 utilise
uniquement des politiques, gateways et simulations VFS déterministes ; aucun
outil ou endpoint MCP externe n'est exécuté.

## Exécuter B04 et B10

Le spécialiste performance exécute les microbenchmarks en mode release, vérifie
les statistiques à partir des observations brutes et produit les deux
livrables attendus :

~~~bash
node benchmarks/run-specialist.mjs
~~~

Les fichiers `performance-distribution.json` (B04) et
`observability-comparison.json` (B10) sont écrits dans `benchmarks/results/`.
Un run court de validation peut être lancé ainsi :

~~~bash
node benchmarks/run-specialist.mjs --iterations 10 --events 10 --warmups 2 \
  --output-dir benchmarks/results/quick
~~~

B10 vérifie les preuves GenOS présentes dans le dépôt. Les systèmes externes
restent explicitement `unsupported` tant qu'un adaptateur versionné n'a pas été
approuvé et exécuté ; une absence de mesure n'est jamais convertie en zéro.

## Exécuter B01, B03 et B04

Les trois spécialistes exécutent le replay déterministe, les injections de
faute/récupérations et les distributions de performance avec le workload du
scénario versionné :

~~~bash
cargo run --release -q -p genos-store --bin replay_benchmark -- \
  --iterations 500 --events 100 --warmups 20 \
  --output benchmarks/results/replay-fidelity-report.json

node benchmarks/resilience-benchmark.cjs \
  --iterations 500 --warmups 20 \
  --output benchmarks/results/resilience-specialist/fault-recovery-report.json

node benchmarks/run-specialist.mjs \
  --tasks B04 --iterations 500 --events 100 --warmups 20 \
  --output-dir benchmarks/results
~~~

Les livrables `replay-fidelity-report.json` et
`performance-distribution.json` sont écrits sous `benchmarks/results/`. Le
rapport brut B03 est conservé sous `benchmarks/results/resilience-specialist/`
et référencé par `evidence-audit-report.json`. Les résultats incluent la
révision, la plateforme et les commandes exactes.

Pour des smoke tests locaux plus courts, réduisez `--iterations`, `--warmups`
et `--events` sur les mêmes commandes.

## Politique de coordination

Chaque tâche doit suivre le cycle :

~~~text
parent snapshot
  -> fork par hypothèse
  -> mutation du génome et du budget dans la branche
  -> exécution isolée
  -> événements, coûts, tokens et artefacts
  -> diff parent/siblings
  -> replay
  -> revue de l'auditeur
  -> merge conditionnel
~~~

Les benchmarks publics restent marqués blocked_external_dataset tant que le
dataset, le runtime agent et les conditions de comparaison ne sont pas
approuvés. L'orchestrateur ne fabrique pas de résultats quand une dépendance
externe manque.

## Benchmarks de sécurité B05 et B09

Le runner de sécurité exécute les contrôles MCP locaux de B05 et matérialise
le gate externe de B09 :

~~~bash
node benchmarks/run-safety-benchmarks.mjs --task all
~~~

Les livrables sont écrits dans `benchmarks/results/mcp-safety-report.json`
et `benchmarks/results/safety-public-report.json`. B05 échoue si un prédicat
ou une suite requise échoue. B09 ne lance aucun dataset public tant que les
entrées épinglées et l'approbation humaine décrites dans `public-gates.json`
ne sont pas fournies ; son rapport bloqué
ne contient donc aucun score public fabriqué.

## Benchmarks publics B06–B08

Préparer les trois livrables sans exécuter de runtime externe :

~~~bash
node benchmarks/public-runner.mjs
~~~

Cette commande produit `swe-public-report.json`,
`tool-use-public-report.json` et `web-public-report.json` dans un run horodaté
sous `benchmarks/workspace/runs/`. En l'absence des datasets et approbations,
les scores restent explicitement `null` et les blocages sont consignés.

Une exécution externe exige un manifeste d'approbation et, pour chaque
composant, un locator de dataset ainsi qu'une commande. Les noms des variables
sont déclarés dans `public-suites.json`. Une commande est encodée comme un
tableau JSON d'arguments, sans interpréteur shell, et doit écrire le contrat de
résultat dans `GENOS_BENCHMARK_RESULT_FILE`. Le préflight exige aussi le
SHA-256 du snapshot et une identité de runtime/modèle ; le résultat de
l'adapter doit restituer exactement ces deux valeurs.

~~~json
{
  "approval_id": "approval-2026-08-22",
  "approved_by": "benchmark-owner",
  "approved_at": "2026-08-22T00:00:00Z",
  "tasks": {
    "B06": {
      "dataset_approved": true,
      "runtime_approved": true,
      "comparison_approved": true,
      "dataset_checksums": {
        "swe-bench": "<approved SHA-256>",
        "terminal-bench": "<approved SHA-256>"
      },
      "runtime_identities": {
        "swe-bench": "agent-runtime@model-revision",
        "terminal-bench": "agent-runtime@model-revision"
      },
      "comparison_conditions_sha256": "<approved SHA-256>"
    }
  }
}
~~~

~~~bash
GENOS_SWE_BENCH_DATASET=/datasets/swe-bench \
GENOS_SWE_BENCH_SHA256='REPLACE_WITH_64_HEX_SHA256' \
GENOS_SWE_BENCH_RUNTIME_IDENTITY=agent-runtime@model-revision \
GENOS_SWE_BENCH_COMMAND='["python","adapter.py","--suite","swe-bench"]' \
GENOS_TERMINAL_BENCH_DATASET=/datasets/terminal-bench \
GENOS_TERMINAL_BENCH_SHA256='REPLACE_WITH_64_HEX_SHA256' \
GENOS_TERMINAL_BENCH_RUNTIME_IDENTITY=agent-runtime@model-revision \
GENOS_TERMINAL_BENCH_COMMAND='["python","adapter.py","--suite","terminal-bench"]' \
node benchmarks/public-runner.mjs \
  --tasks B06 \
  --approval approval.json \
  --execute
~~~

Contrat minimal écrit par chaque adapter :

~~~json
{
  "score": 0.42,
  "metrics": { "pass_rate": 0.42 },
  "sample_count": 100,
  "dataset_revision": "snapshot-v1",
  "dataset_checksum": "<same approved SHA-256>",
  "runtime": { "identity": "agent-runtime@model-revision" },
  "artifacts": []
}
~~~

Les résultats exécutés restent `executed_pending_audit` et
`not_claimable`. Le runner conserve les scores natifs de chaque suite et ne
calcule pas de moyenne trompeuse entre benchmarks incompatibles. Avec
`--execute`, un gate bloqué termine avec le code 2 et une erreur d'exécution
termine avec le code 1.

Les tests du runner utilisent uniquement des fixtures locales :

~~~bash
node --test benchmarks/test-public-runner.mjs
~~~

## Synchroniser avec Studio

Démarrer le backend Studio sur le port 4000, puis lancer :

~~~bash
./benchmarks/run-fleet.sh --studio
~~~

Le pont crée ou réutilise le workspace Studio `Benchmarks`, déploie les agents
avec le même `fleetId`, rattache les membres à l'orchestrateur et publie un
événement de recrutement pour chacun. La synchronisation est idempotente par
nom et `fleetId`.

Variables optionnelles :

~~~bash
GENOS_STUDIO_URL=http://localhost:4000
GENOS_STUDIO_TOKEN=<your-admin-or-operator-access-key>
~~~
