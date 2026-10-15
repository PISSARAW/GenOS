# 0546 — Persister les époques morphogénétiques

- **Statut** : Accepté pour les checkpoints, balayage borné au démarrage et reprise opérateur protégée
- **Date** : 2026-10-15
- **Domaine** : orchestration, morphogenèse, reprise, SQLite
- **Décideurs** : équipe GenOS
- **Lié à** : [0541](0541-epoques-morphogenetiques-budgetees.md)

## Contexte

Les cycles morphogénétiques répétés peuvent reprendre uniquement si l'époque,
les résultats observés, le budget et la barrière de quiescence survivent au
redémarrage. L'état conservé uniquement en mémoire ne permet ni reprise fiable
ni rejet des mises à jour concurrentes ou rejouées.

## Décision

Le backend enregistre un checkpoint par mission, lié à sa portée organisation
et projet. Chaque checkpoint conserve l'époque, la phase, l'état de mission,
les résultats, le budget et la barrière. Une révision attendue clôture les
écritures concurrentes; une clé d'idempotence conserve le résultat exact d'une
écriture déjà acceptée. Les données persistées sont vérifiées par empreinte au
chargement. Le contrat de stockage est exposé par
`morphogenesisEpochStore`. `agentRoundService` restaure les Maps et la mission
quand un rapport terminal arrive après la perte de l'état en mémoire. L'inscription
persist l'état initial; les rapports terminaux font avancer le checkpoint. Après la
réconciliation des runtimes, le worker de maintenance balaie jusqu'à 32 checkpoints
`advancing`, dans l'ordre le plus ancien d'abord. Lors d'une phase `advancing`, les
missions d'époque durable sont rechargées; seules les entrées `pending` sont dispatchées,
tandis que `dispatched` reste terminal. Une entrée `pending` dont le worker est déjà
actif n'est pas relancée; le balayage prouve une tentative de reprise, pas la réussite
du dispatch ou de l'exécution. Sans mission encore persistée, l'état devient
`recovery_required` et attend une reprise opérateur explicite; il n'est pas réévalué
automatiquement. Le snapshot du budget
après réservation est recopié dans chaque continuation afin de restaurer l'allocation exacte.
La transition normale attend la fermeture des processus de toute la cohorte. Trinity reste
exclu de ce store.

## Conséquences

### Positives

- Le backend peut reconstruire un checkpoint complet et borné par mission au prochain
  rapport terminal ou au balayage de démarrage du worker de maintenance.
- Une continuation rejouée ne double pas la progression d'époque.
- Les conflits de révision et de portée échouent explicitement.

### Négatives

- Le coordinateur doit fournir une clé stable par checkpoint et la révision
  qu'il a lue.
- Le balayage traite au plus 32 checkpoints `advancing` par démarrage; les suivants
  attendent le boot suivant. Un checkpoint ambigu sans continuation durable est rendu
  actionnable, puis l'API protégée `POST /api/control-plane/morphogenesis/:missionId/resume`
  déclenche la reprise.
  Cette API exige `workspace:write` et la portée organisation/projet exacte. Si les
  missions durables sont incohérentes, le checkpoint reste `recovery_required` et l'action
  retourne un conflit plutôt que de redispatcher à l'aveugle.

## Alternatives

- Garder l'état en mémoire : rejeté, car un redémarrage perdrait la progression.
- Remplacer le checkpoint sans révision ni clé d'idempotence : rejeté, car des
  écritures concurrentes ou rejouées pourraient réécrire l'état sans détection.
