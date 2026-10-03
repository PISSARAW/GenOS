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

Un contrat explicitement marqué `factual_read_only` avec modifications de fichiers
désactivées requiert le snapshot et la recherche de défaillances exécutés par le
runtime, puis les portes existantes de dossiers de workers et d’homéostasie. Les
phases de diagnostic, mutation, replay et promotion de code ne sont pas imposées
à une réponse factuelle en lecture seule. Le benchmark conserve son oracle de
citations indépendant et ne qualifie un run que si cet oracle réussit.
Le sélecteur de stratégie conserve exactement une décision par entrée du registre,
y compris lorsque la stratégie primaire est une solution de repli. Cette règle
empêche une migration automatique de reconstruire le contrat et d’effacer son mode
d’évaluation pendant la mission.

Le runtime local valide le contrat d'artefact d'un worker à chaque essai du modèle,
avant l'émission d'un reçu de succès. Une sortie invalide déclenche une nouvelle
génération avec ses motifs de rejet; après épuisement des essais, la mission échoue.
La synthèse reçoit une projection des affirmations et références vérifiées de
chaque dossier. Les dossiers complets restent persistés pour l'audit et les
affirmations utilisées dans `dossierInfluence` doivent leur correspondre exactement.

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
