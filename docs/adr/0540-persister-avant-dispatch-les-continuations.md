# ADR 0540 — Persister les continuations avant leur dispatch

- **Statut** : accepté
- **Date** : 2026-10-15
- **Domaine** : orchestration, morphogenèse, reprise
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0430, 0534, 0535

## Contexte

Les époques morphogénétiques sélectionnent des workers survivants, réservent une
tranche de jetons et préparent leurs missions de continuation. Une insertion
SQLite déclenchée sans attente permettait au dispatch de commencer avant la
persistance. Un arrêt du processus dans cette fenêtre pouvait perdre la mission.
De plus, une transition morphologique refusée annulait la réservation avec l'état
de budget antérieur à la réservation, ce qui invalidait le remboursement.

## Décision

Préparer toutes les missions d'une vague, puis les écrire dans `continuation_queue`
dans une transaction SQLite unique. N'exposer les missions dans la file locale et
ne les dispatcher qu'après le commit durable. En cas d'erreur d'écriture, annuler
la transaction, ne rien dispatcher et arrêter la continuation avec un motif
explicite. L'annulation d'une réservation reçoit l'état qui porte effectivement
l'époque active.

Cette barrière garantit la persistance des missions, pas la restauration complète
de l'état du contrôleur d'époques après redémarrage. Le registre d'époque reste
volatile tant qu'un journal de contrôleur durable n'est pas implémenté.

## Conséquences

### Positives

- Une reprise ne peut pas devancer l'écriture durable de ses missions.
- Une vague contenant plusieurs survivants est écrite entièrement ou pas du tout.
- Les refus d'adaptation restituent le budget et ne consomment pas une époque.

### Négatives

- Chaque vague attend une transaction SQLite avant de démarrer.
- Une panne de base bloque la vague au lieu de tenter un dispatch non durable.

## Alternatives

- **Écrire les missions en arrière-plan** : rejeté, car le dispatch peut précéder
  la persistance.
- **Écrire une mission par transaction** : rejeté, car une panne au milieu de la
  vague laisserait un ensemble partiel prêt à reprendre.
- **Restituer le budget sans l'identifiant de réservation** : rejeté, car un état
  périmé pourrait annuler une autre époque.
