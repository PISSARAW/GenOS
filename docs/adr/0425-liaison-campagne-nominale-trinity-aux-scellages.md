# ADR 0425 — Lier la campagne nominale Trinity aux scellages durables

## Statut

Accepté.

## Contexte

La campagne nominale lisait la sélection du variant, les statuts des mondes,
les gates dans la décision et la signature AgentGit. Trois lignes de mondes
`compared` et une expérience `promoted` pouvaient satisfaire ces contrôles
sans empreinte du snapshot initial ni historique durable de promotion.
Cette lacune concernait les douze variants, y compris `controlled` qui ne
requiert pas de gate supplémentaire.

## Décision

- Les mondes initiaux doivent porter chacun la même empreinte SHA-256 que
  l'expérience et des racines de workspace absolues distinctes.
- La campagne exige les six transitions durables, dans l'ordre, de `designed`
  à `promoted`. La première transition doit référencer l'empreinte scellée.
- Une absence ou une divergence produit des codes de refus distincts :
  `sealed_baseline_mismatch`, `isolated_worlds_not_observed` ou
  `promotion_trace_incomplete`.

## Limites

Ces contrôles vérifient la cohérence des enregistrements durables; ils ne
recalculent pas le contenu historique des workspaces. Les gates propres aux
variants, les contrôles du candidat et la signature AgentGit restent requis.
Une mission pré-correctifs sans ces enregistrements reste non qualifiée.
