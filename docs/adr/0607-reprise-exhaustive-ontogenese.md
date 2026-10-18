# ADR 0607 — Reprise exhaustive et fail-closed de l’Ontogenèse

- **Statut** : Accepté pour les opérations raccordées
- **Date** : 2026-10-18
- **Domaine** : Ontogenèse, crash recovery, idempotence, preuves
- **Décideurs** : mainteneurs GenOS
- **Lié à** : [ADR 0606](0606-socle-durable-ontogenese.md), [ADR 0334](0334-ontogenese-pilotage-reprise-et-retention.md)

## Contexte

Un crash peut survenir entre l’intention, la persistance locale, le lancement
d’un runtime, un commit Git et l’enregistrement de son résultat. Rejouer sans
inspection risque un double effet ; abandonner sans trace masque un état réel.

## Décision

Avant le premier effet d’un tick sous claim projet, réconcilier chaque opération
durable non terminale sous un bail propre. La décision produit un reçu immuable
dans `ontogenesis_recovery_receipts`.

Les règles sont :

- une intention `prepared` est rejouable avec la même clé, sans prétendre qu’un effet existe ;
- un dispatch sans ligne d’exécution revient à `prepared` ;
- un runtime vivant est adopté, un runtime mort est clôturé comme interrompu ;
- une intégration reprend le pipeline existant, qui retrouve le commit par `Genos-Operation` ;
- un effet inconnu ou contradictoire passe à `escalated`, place le projet en
  `WAITING_INPUT` et écrit une notification durable dans l’outbox ;
- aucune stratégie ne rejoue automatiquement un effet externe ambigu.

Le dispatch et l’intégration sont raccordés au journal. La réconciliation est
exécutée à l’intérieur du claim projet, avant les échéances et le prochain pas
de la machine à états.

## Conséquences

### Positives

- Les fenêtres de crash principales possèdent une issue déterministe et auditée.
- La concurrence de reprise est bornée par deux fences : projet et opération.
- Un commit Git déjà produit est adopté sans double commit.

### Négatives

- « Exhaustive » signifie exhaustive pour les types raccordés au registre ; un
  nouveau type sans stratégie est bloqué et escaladé.
- L’inspection d’un runtime dépend de la qualité du harnais local.

## Alternatives

- Rejouer toute opération non terminale : rejeté, car un effet externe peut déjà avoir eu lieu.
- Considérer le PID comme preuve : rejeté, car il peut être réutilisé ou devenir obsolète.
- Ignorer les opérations inconnues : rejeté, car cela fabrique un faux succès.

## Validation

`node backend/tests/test_ontogenesis_crash_recovery.js`
