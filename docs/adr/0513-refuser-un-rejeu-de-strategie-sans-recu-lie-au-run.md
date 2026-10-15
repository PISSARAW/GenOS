# ADR 0513 — Refuser un rejeu de stratégie sans reçu lié au run

- **Statut** : Accepté et implémenté pour le garde de phase; producteur de rejeu complet à réaliser.
- **Date** : 2026-10-15
- **Domaine** : Exécution de stratégie et promotion.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0480, reçu de rejeu lié au run; ADR 0507, phase `diff_and_replay` applicable.

## Contexte

Les primitives `causal_replay` et `causal_diff` peuvent chacune retourner
`success: true` alors qu'un replay de trajectoire ne fait que produire une
comparaison `INCONCLUSIVE_PENDING_EXECUTION`. La phase pouvait alors être
enregistrée comme complétée malgré l'absence d'une preuve que le run initial
avait été réexécuté. Le gate de promotion `require_replay` refusait déjà cette
absence, mais l'état intermédiaire de la phase restait ambigu.

## Décision

La phase `diff_and_replay` ne retourne plus `success: true` sans reçu vérifié
run-bound conforme à la politique de promotion. Le reçu doit être retourné par
le pipeline serveur; un champ homonyme dans le contexte de l'appelant n'est pas
pris en compte. En l'absence du reçu, la phase retourne
`STRATEGY_RUN_REPLAY_RECEIPT_MISSING` et le run ne peut pas enregistrer la phase
comme terminée.

Cette décision n'implémente pas le producteur. Tant qu'aucun producteur ne
réexécute le run complet depuis des entrées et versions scellées, la phase
échoue fermé et `require_replay` continue de bloquer la promotion.

## Conséquences

### Positives

- Une phase de comparaison de trajectoire ne peut plus être confondue avec le
  rejeu réussi d'un run complet.
- Un reçu injecté par l'appelant ne peut pas satisfaire la phase.
- Le contrat a un chemin positif explicite dès qu'un producteur valide sera
  raccordé.

### Négatives

- Les phases `diff_and_replay` sans producteur sont bloquées même si leurs
  primitives d'analyse réussissent.
- Les runs qui exigent le rejeu ne peuvent pas être promus tant que l'ADR 0480
  n'est pas satisfait par un producteur persistant.

## Alternatives

- Accepter le succès des primitives `causal_replay` et `causal_diff` comme preuve
  du rejeu : rejeté, car elles ne rejouent pas le comportement du run complet.
- Accepter un reçu transmis dans le contexte appelant : rejeté, car il ne prouve
  pas qu'un exécuteur serveur a réalisé le rejeu.
- Désactiver `require_replay` pour permettre de terminer la phase : rejeté, car
  cela ferait disparaître silencieusement la condition de promotion.

## Vérification

`node backend/tests/test_strategy_replay_stage_wiring.js` vérifie le refus d'un
pipeline dont le replay reste inconclusif, le rejet d'un faux reçu de contexte et
l'acceptation d'un reçu run-bound retourné par le pipeline. Les cas de primitives
manquantes ou inapplicables restent fail-closed.
