# ADR 0277 — Branches réalisables et statut fondé sur les reçus

- **Statut** : Accepté
- **Date** : 2026-10-03
- **Domaine** : Orchestration, stratégie, preuves, benchmarks
- **Lié à** : ADR 0276

## Contexte

Une mission complexe pouvait demander plusieurs branches alors que le portefeuille
sélectionné ne possédait ni `fork` ni `solve`. La phase obligatoire devenait alors
impossible et empêchait le démarrage d’un chemin direct pourtant sélectionné.
Dans d’autres missions, l’homéostasie autorisait un statut `completed` alors que
l’audit constatait des outils requis sans reçu d’exécution.

## Décision

Pour les missions non sécuritaires, le nombre de branches est limité à une si le
portefeuille ne sait pas exécuter `fork` et `solve`. Les missions de sécurité
conservent leurs phases spécialisées bloquantes. Une inhibition partielle du
fanout conserve au moins un worker lorsqu’un worker était demandé; une inhibition
totale peut toujours conduire à zéro.

Le statut final `success` exige un audit `required-coverage-complete` en plus de
l’issue des agents et de la porte d’homéostasie. Une couverture incomplète produit
`required_coverage_incomplete` et empêche le statut persistant `completed`.
Les reçus réels restent la seule preuve d’exécution; aucune mention dans le prompt
ou la télémétrie ne remplace un reçu.

## Conséquences

- Les tâches simples peuvent suivre le chemin direct choisi par la stratégie.
- Les missions qui n’exécutent pas toutes leurs phases sont désormais signalées
  comme incomplètes, ce qui rend visibles les lacunes du runtime local.
- Un score d’oracle externe reste nécessaire pour qualifier chaque benchmark.

## Alternatives

- Déclarer une phase exécutée dès qu’elle apparaît dans le plan : rejeté, car
  cela fabriquerait de la preuve.
- Autoriser toutes les branches malgré l’absence de primitives : rejeté, car
  la phase ne pourrait pas être réalisée.
