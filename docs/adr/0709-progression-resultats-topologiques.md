# ADR 0709 — Progression canonique des résultats topologiques

- Statut : accepté
- Date : 2026-10-20

## Contexte

Le chemin public `dispatch_biological` composait une session topologique, lançait
les workers, puis évaluait immédiatement la clôture. Seul Rhizome appliquait les
résultats à son runtime canonique avant cette évaluation. Les autres topologies
pouvaient donc disposer de reçus workers valides tout en conservant leur état
initial. Un transport réussi ne constituait pas une preuve de progression.

## Décision

Le handler public passe désormais par un routeur unique de progression après la
lecture des reçus workers et avant la barrière de clôture. Chaque topologie peut
fournir un applier sous `topologyResultAppliers/<mode>.cjs` avec une fonction
`apply`. En l'absence d'applier, le routeur retourne explicitement `BLOCKED` et
la clôture spécialisée continue de refuser l'état initial.

Un applier doit utiliser le runtime persistant de sa topologie. Il ne peut ni
écrire directement un état terminal, ni fabriquer un verdict, un oracle ou une
preuve à partir du seul succès de transport. Les erreurs d'application sont
propagées et empêchent la clôture.

## Conséquences

- Les appliers peuvent être livrés et qualifiés indépendamment du handler.
- La progression observée est publiée dans `biologicalMode.runtimeProgression`.
- Une topologie sans applier reste utilisable pour la composition et les reçus,
  mais sa mission publique ne peut pas être déclarée terminée.
- Les protocoles multiphases doivent lancer ou consommer les phases de preuve
  prévues par leur runtime au lieu de réinterpréter un dossier parallèle.
