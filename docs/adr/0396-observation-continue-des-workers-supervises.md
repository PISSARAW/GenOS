# ADR 0396 — Observer les workers supervisés pendant leur mission

## Statut

Accepté pour le chemin des workers non natifs.

## Contexte

La supervision des processus attache l'observateur `continuousExecution` à une
mission active et publie les changements de fichiers déclarés avec l'identité de
son run. Le routage `localRuntime` exécutait les workers de modèle local dans
le processus du backend. Ce chemin ne crée pas d'observateur continu, même si
la mission demandait explicitement le mode `observe` ou `control`.

## Décision

Une mission de worker avec `continuousExecution.mode` égal à `observe` ou
`control` emprunte le superviseur de processus. Elle garde son exécuteur et
son modèle local. Le mode `off` conserve le routage existant. Les méthodes
natives restent sur leur chemin déterministe, avant le routage des workers
supervisés. Leur observation bornée a été ajoutée par
[l'ADR 0397](0397-perception-des-workers-natifs-et-revision-locale.md).

## Conséquences et preuves

Le superviseur observe les dépendances pendant l'exécution, lie les reçus au
run, et le mode `control` invalide un résultat devenu périmé. Ce mécanisme
atteste la détection d'un changement déclaré, pas une révision autonome du
plan ni une conscience. Le test de routage vérifie le choix du superviseur ;
la campagne `run_worker_compliance_missions.cjs` avec
`GENOS_COMPLIANCE_PERCEPTION=1` lance chaque type dans un espace isolé et
conserve les observations et les absences d'observation par type.
