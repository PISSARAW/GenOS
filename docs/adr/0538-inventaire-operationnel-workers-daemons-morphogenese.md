# ADR 0538 — Fonder les recettes morphogénétiques sur l’inventaire opérationnel des workers et daemons

- **Statut** : proposé — shortlist et observation read-only des instances affectées implémentées; admission runtime non implémentée
- **Date** : 2026-10-15
- **Domaine** : orchestration, morphogenèse, workers, daemons, capacité
- **Lié à** : ADR 0034, 0043, 0064, 0079, 0296, 0430, 0522, 0534, 0536

## Contexte

Le compilateur de stratégie joint au plan des phases de méthodes consultatives et un
portefeuille borné de topologies, variants et expressions `NEST`. Un roster consultatif
est maintenant construit depuis `workerExecutorRegistry.executorCatalog()` : il
énumère les couples type/méthode natifs, vérifie leur compatibilité de contrat et les
confronte aux capacités explicitement disponibles (`missionCapabilityPlan.availableCapabilities`
ou `autonomyPlan.capabilityInventory.available`) ainsi qu’aux capacités déclarées
des kinds workers affectés. Les exigences de mission ne sont pas ajoutées à cet
inventaire. Les capacités dérivées des kinds ne certifient pas l’état runtime des
instances. Le reçu expose les options retenues et leurs raisons. Un contrat compatible
peut être proposé pour une affectation existante. Ce roster est une shortlist de
compatibilité, pas un inventaire d’instances.

La stratégie observe maintenant les identifiants d’instances présents dans les
affectations du plan via un `SELECT` read-only sur `agents` et `garage_queue`. Elle
distingue un état `idle` observé, une instance occupée/indisponible et l’inconnu. Un
état `idle` issu de la base n’établit ni la vie du processus ni une admission; une
lease expirée ou incohérente reste inconnue. Ce lecteur ne découvre pas les instances
libres hors affectations et n’accorde pas `READY_FOR_ADMISSION`. Il ne reçoit pas
d’inventaire runtime des daemons. `resident_daemon` n’est une option retenue que si
`autonomyPlan.operationalConstraints.daemonAllowed` vaut `true`; le compilateur lit
ce champ depuis le plan, pas depuis des propriétés arbitraires de la mission. Cela
prouve une autorisation déclarée, pas qu’un daemon correspondant existe ou est éveillé.
Un catalogue d’exécuteurs ou une affectation existante ne garantit pas qu’une instance
sera disponible au moment du dispatch.

Les registres canoniques décrivent des kinds, capacités déclarées, contrats et
phénotypes possibles. Ils ne prouvent pas qu’une instance est disponible. Une liste
de workers affectés ne constitue pas un pool libre; un daemon déclaré n’est pas un
daemon sain; une lease nominale n’est pas nécessairement valide au moment du dispatch.
L’absence de ces observations doit rester inconnue et ne peut être assimilée à une
capacité ou une indisponibilité certaine.

## Décision proposée

Compléter la shortlist par une **couche de résolution des ressources consultative**,
après l’observation des affectations existantes et avant toute activation. Pour chaque recette admissible, elle
produit un plan explicable de rôles et de ressources nécessaires, puis le confronte
à un instantané opérationnel attesté. La shortlist existante apporte les couples
`WorkerKind`/méthode compatibles et les conflits avec les affectations courantes; la
nouvelle couche doit résoudre les instances réellement admissibles, leurs contraintes
observées et les ressources manquantes. Pour les daemons, elle doit compléter le
contrôle actuel de `autonomyPlan.operationalConstraints.daemonAllowed` par leur état
et leur disponibilité runtime. Elle
n’affecte pas de worker, ne démarre pas de daemon et ne modifie aucune lease.

L’inventaire opérationnel distingue explicitement :

- le catalogue des types possibles (kinds, méthodes, profils/phénotypes et capacités
  déclarées) ;
- les instances observées (identité, état, disponibilité, charge, lease, portée et
  limites de concurrence) ;
- les capacités vérifiées au moment de la décision et leur provenance, date
  d’observation, expiration et autorité productrice.

Une recette reçoit `READY_FOR_ADMISSION` seulement si chaque rôle peut être résolu
vers une ressource réelle dont l’état, les permissions et la lease sont valides pour
la fenêtre considérée, et si les budgets agrégés, limites de spawn, de fan-out et de
concurrence passent les gates. Sinon, le reçu expose `BLOCKED` ou `UNKNOWN` avec les
éléments manquants. `UNKNOWN` n’est jamais départagé en faveur d’une recette.
L’algorithme conserve `NO_CHANGE`, la décision Pareto et l’abstention de l’ADR 0536.

La décision n’autorise qu’une **préparation pour admission**, qui devra être
revalidée atomiquement au point d’activation. Toute étape ultérieure de réservation,
affectation, démarrage de daemon ou transition topologique exige une autorité déjà
accordée, des contrôles de lease et budget à l’instant du commit, une stratégie de
rollback testée et les preuves de persistance/restauration requises par l’ADR 0430.
Cette ADR ne change pas ces frontières d’autorité.

## Conséquences attendues

### Positives

- La méthode, le worker et le daemon proposés peuvent varier selon la tâche, les
  exigences de preuve et les ressources réellement disponibles.
- Une incapacité est attribuable à une observation concrète plutôt qu’à une absence
  supposée dans un registre déclaratif.
- Les reçus peuvent expliquer pourquoi une recette serait exécutable, bloquée ou
  indéterminée sans prétendre qu’elle a été exécutée.

### Négatives

- Il faut définir un contrat commun, versionné et horodaté pour les inventaires de
  workers et de daemons, ainsi que leur provenance et leur expiration.
- La résolution reste sujette à une course entre observation et admission ; seule une
  revalidation au point d’usage peut fermer cette fenêtre.
- La présence d’une ressource et la compatibilité d’un profil ne démontrent ni le
  gain de qualité de la recette ni la réussite de la mission.

## Qualification requise avant acceptation

Les tests doivent couvrir les inventaires absents, périmés, contradictoires et
explicitement vides; workers affectés versus libres; kinds et méthodes incompatibles;
daemons absents, en sommeil, `STALE` ou en panne; leases expirant entre compilation et
admission; capacités révoquées; budgets concurrents; limites de spawn; et revalidation
atomique. Les scénarios positifs doivent prouver la provenance et la fraîcheur de
chaque observation. Les scénarios négatifs doivent démontrer que l’incertitude ne
devient ni sélection opérationnelle ni faux succès.

Une campagne comparative séparée est nécessaire pour établir l’utilité du choix
adaptatif de ressources : tâches appariées, variantes fixes de référence, familles
hors entraînement, oracle indépendant, coûts totaux et latences incluant attente,
coordination et récupération. La réussite des tests d’intégration prouve le contrat
technique, pas la supériorité de l’orchestrateur.

## Alternatives écartées

- **Traiter les catalogues comme inventaire runtime** : rejeté, les types possibles
  ne prouvent pas la disponibilité d’une instance.
- **S’arrêter à la shortlist type/méthode** : insuffisant pour distinguer une
  affectation existante d’une instance libre, saine, autorisée et munie d’une lease
  encore valide; cela ne résout pas non plus la disponibilité des daemons.
- **Démarrer ou réaffecter automatiquement les ressources dès le classement** :
  rejeté tant que l’autorité, la réservation atomique et la restauration ne sont pas
  prouvées.
