# ADR 0312 — Garage Fabric adaptatif pour le control plane

- **Statut** : Accepté — runtime durable, fencing et preuves terminales raccordés
- **Date** : 2026-10-05
- **Dernière revue** : 2026-10-06
- **Domaine** : Orchestration, workers, capacité, résilience

## Contexte

Le `workerGarageService` limite déjà les workers actifs par orchestrateur et
par projet. Cette capacité est correcte comme garde-fou, mais elle ne décrit
pas le choix de stratégie : admission immédiate, attente, réutilisation,
préemption ou stockage froid. Une erreur `WORKER_GARAGE_FULL` ne doit pas être
confondue avec une décision optimale.

## Décision

Conserver le plan pur de `garageFabricService.js` comme aide à la décision et
façade compatible, puis raccorder ses politiques au runtime durable. Les plans
seuls ne réservent pas de capacité et ne prouvent pas une exécution. Le service
fournit :

- douze modes d'exploitation inspirés des garages physiques ;
- une décision `admit`, `queue`, `preempt` ou `reject` ;
- des leases bornés avec expiration et renouvellement contrôlé ;
- une file priorisée persistée dans SQLite ;
- un snapshot vérifié obligatoire avant libération du slot préempté.

La file SQLite est la source d'autorité. Le claim et la réservation locale/projet
partagent une transaction `BEGIN IMMEDIATE` ; une boucle surveille les demandes
et adopte les missions worker des parcours communs. Chaque tentative porte un
UUID de bail qui clôture les callbacks anciens. Un ACK ne termine jamais une
demande : il faut le run courant terminé, son événement terminal lié au même
`executionRunId` et un artefact conforme au contrat typé.

Le freeze exige un consentement explicite, un arrêt confirmé puis un snapshot
de fichiers durable et une capsule JSON hachée, liés au worker et au parent.
Le GC conserve les fichiers pendant `freezing` et `freeze_failed`, même avec
un délai nul. Le thaw vérifie les empreintes, restaure une nouvelle capsule
de fichiers et remet la mission en file avec son budget restant mesuré.
Une allocation ou consommation inconnue, ou un budget épuisé, interdit la reprise.
Cette reprise n'est pas une restauration exacte de RAM ni une preuve du succès
de la mission. Les capsules Garage SQLite ne sont pas confondues avec un simple
ACK des anciennes primitives de cryptobiose.

## Alternatives

1. Ajouter douze services indépendants : rejeté, car cela dupliquerait la
   comptabilité des slots et les règles de sûreté.
2. Remplacer le garage SQL par une file en mémoire : rejeté, car un redémarrage
   ne doit pas perdre les identités ni les états des agents.
3. Laisser `WORKER_GARAGE_FULL` être le seul comportement : rejeté, car cela
   empêche l'équité, la préemption sûre et l'adaptation topologique.

## Invariants

- un worker protégé ou en quarantaine n'est jamais candidat à la préemption ;
- une préemption exige un snapshot vérifié avant libération du slot ;
- une lease expirée ne peut pas être renouvelée ;
- la file combine la politique choisie et un vieillissement anti-famine ;
- aucun mode de garage ne contourne les contrats, budgets, leases d'outils ou
  barrières de preuves GenOS.

## Conséquences

Les douze politiques ont des effets exécutables et partagent les mêmes
gates. Le journal `garage_events`, la réconciliation des baux, les contrôles
opérateur et les tests SQLite/processus/artefacts sont raccordés.

Une erreur de suspension conserve une réservation prudente. Les effets
externes demandent leur propre idempotence. Les quotas par organisation,
la restauration exacte de processus et un ordonnanceur hors SQLite ne
sont pas fournis. Voir la [référence complète](../02-orchestration/topologies/garage-fabric.md)
pour les composants, l'automate, les API et le profil de validation `test:garage`.
