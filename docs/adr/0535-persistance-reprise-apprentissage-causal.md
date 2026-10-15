# ADR 0535 — Persistance et reprise idempotente de l’apprentissage causal

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : backend, apprentissage, mémoire
- **Décideurs** : GenOS
- **Lié à** : ADR 0533 — Raccorder la boucle causale aux reçus de stratégie

## Contexte

Le pont causal ne s’exécutait qu’en mémoire après la transaction du reçu worker.
Un arrêt pouvait donc perdre l’apprentissage ou le rejouer sans trace durable.
La mémoire issue de cette boucle n’était pas rappelable après redémarrage.

## Décision

Écrire un outbox SQLite à clé unique `run_id` dans la même transaction que le
reçu terminal. Un dispatcher à bail revalide le reçu biologique, le scope et la
preuve de qualité signée avant traitement. Il persiste le reçu causal, la mémoire
consolidée, le statut et les erreurs de reprise. Les retries utilisent la même
clé d’idempotence ; une preuve altérée est rejetée et les erreurs transitoires
sont relancées avec backoff. Les souvenirs ne sont rappelés que dans le tenant
exact et après revalidation de la preuve.

## Conséquences

### Positives

- Une interruption avant traitement laisse une entrée récupérable après reprise.
- Un run ne peut pas consolider deux apprentissages différents sous le même identifiant.
- Le prompt peut retrouver une mémoire causalement vérifiée après redémarrage.

### Négatives

- Les tâches en attente progressent lorsque le worker backend tourne ou lors de
  la récupération d’une mission.
- L’état épistémique et régulateur en mémoire est réappliqué après redémarrage ;
  sa valeur canonique durable reste le reçu et la mémoire stockés par l’outbox.

## Alternatives

- Appliquer l’apprentissage directement après le reçu : rejeté, car une panne
  sépare alors le commit du reçu et l’apprentissage.
- Considérer la file en mémoire comme suffisante : rejeté, car elle disparaît au
  redémarrage et ne permet pas de revalider la provenance.
