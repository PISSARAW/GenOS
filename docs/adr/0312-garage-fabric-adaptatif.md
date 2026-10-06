# ADR 0312 — Garage Fabric adaptatif pour le control plane

- **Statut** : Accepté — runtime durable, fencing et preuves terminales raccordés
- **Date** : 2026-10-05
- **Domaine** : Orchestration, workers, capacité, résilience

## Contexte

Le `workerGarageService` limite déjà les workers actifs par orchestrateur et
par projet. Cette capacité est correcte comme garde-fou, mais elle ne décrit
pas le choix de stratégie : admission immédiate, attente, réutilisation,
préemption ou stockage froid. Une erreur `WORKER_GARAGE_FULL` ne doit pas être
confondue avec une décision optimale.

## Décision

Introduire `garageFabricService.js`, un moteur de décision pur exporté par le
garage existant. Il fournit :

- douze modes d'exploitation inspirés des garages physiques ;
- une décision `admit`, `queue`, `preempt` ou `reject` ;
- des leases bornés avec expiration et renouvellement contrôlé ;
- une file priorisée ;
- un plan de snapshot obligatoire avant préemption.

La file SQLite est authoritative. Claim et reservation locale/projet sont
transactionnels ; une boucle surveille les demandes et adopte les missions
worker des parcours communs. Un ACK ne termine jamais une demande : il faut
le run courant termine et un artefact conforme au contrat type.

Le freeze exige un arret confirme puis un snapshot de fichiers durable et
une capsule JSON hashee, lies au worker et au parent. Le thaw restaure une
nouvelle capsule de fichiers et remet la mission en file avec son budget
restant. Cette reprise n'est pas une restauration exacte de RAM ni une
preuve du succes de la mission. Les capsules Garage SQLite ne sont pas
confondue avec un simple ACK des anciennes primitives de cryptobiose.

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

Les douze politiques ont des effets executables et partagent les memes
gates. Le journal garage_events, la reconciliation des baux, les controles
operateur et les tests SQLite/processus/artefacts sont raccordes.

Une erreur de suspension conserve une reservation prudente. Les effets
externes demandent leur propre idempotence. Les quotas par organisation,
la restauration exacte de processus et un ordonnanceur hors SQLite ne
sont pas fournis. Voir la [reference complete](../02-orchestration/topologies/garage-fabric.md).
