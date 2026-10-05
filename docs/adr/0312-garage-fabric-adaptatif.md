# ADR 0312 — Garage Fabric adaptatif pour le control plane

- **Statut** : Accepté — file persistante et cycle de préemption raccordés
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

La file SQLite `garage_queue` est persistante. Le dispatch opérateur peut y
déposer une demande lorsque le garage est plein ; la libération d'un slot
déclenche le claim et le lancement de la demande suivante. La préemption
compose les primitives de cryptobiose existantes et enregistre le snapshot
avant de rendre le worker non actif.

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
- la file est ordonnée par priorité puis par ancienneté ;
- aucun mode de garage ne contourne les contrats, budgets, leases d'outils ou
  barrières de preuves GenOS.

## Conséquences

Le control plane possède désormais un vocabulaire stable pour choisir une
stratégie de capacité, une file survivant au redémarrage et un cycle de
préemption raccordé aux capsules de cryptobiose. La réconciliation avancée
des leases expirées et la télémétrie détaillée des transitions restent à
étendre.
