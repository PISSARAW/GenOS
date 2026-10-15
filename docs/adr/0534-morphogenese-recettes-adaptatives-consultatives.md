# ADR 0534 — Compiler des recettes morphogénétiques consultatives

- **Statut** : accepté pour la première tranche consultative
- **Date** : 2026-10-15
- **Domaine** : orchestration, morphogenèse, preuve
- **Lié à** : ADR 0101, 0288, 0430, 0522

## Contexte

La sélection initiale et une continuation quiescente peuvent exploiter les
topologies ; elles ne constituent pas un contrôleur général de toutes les formes,
variants, workers, méthodes et daemons. Une recette composite peut être compilée
sans que ses affectations soient exécutées. Le score d'évidence d'un rapport worker
peut guider une investigation, mais n'établit pas le succès du livrable.

## Décision

Définir le compilateur de recette comme un **planificateur consultatif**. Sa sortie
décrit un graphe typé, les variantes compatibles, les rôles et ressources proposés,
les contraintes dures, les coûts et gains estimés, les preuves et incertitudes,
une alternative `NO_CHANGE`, ainsi qu'un plan de réfutation et de reprise. Il ne
crée pas à lui seul des workers, ne lance pas de daemons, n'affecte pas le runtime
et ne promeut aucune issue. Une future activation doit relier la recette exacte
aux affectations observées et aux reçus de la barrière de preuve.

L'apprentissage ne reçoit que des outcomes vérifiés par un oracle indépendant et
liés à la tâche, au commit, au modèle, au budget et à la recette exécutée. Le
contrôleur peut explorer sous budget dans des environnements isolés ; il doit
conserver les résultats manquants comme inconnus. Un `commit` de transition
collective reste fermé jusqu'à une autorité authentifiée, un snapshot restaurable
testé et une écriture CAS durable, conformément à l'ADR 0430.

La première implémentation compile cinq phases bornées depuis le profil de mission,
la topologie sélectionnée, les capacités, les affectations existantes et le budget.
Elle s'exécute après l'activation morphologique dans le plan de mission. Les recettes
bloquées restent visibles. Seul un contrat de méthode compatible dont les entrées
sont admises par le registre peut être lié à une affectation existante ; les méthodes
natives sans paramètres valides restent consultatives. Le raccord ne change ni le
type des workers, ni leurs leases, ni le graphe topologique.

## Options considérées

- **Choisir seulement une topologie canonique** : simple, mais ignore les variants,
  compositions et affectations qui peuvent expliquer le résultat.
- **Exécuter immédiatement toute recette compilée** : rejeté ; compilation et
  scoring ne prouvent ni autorité, ni budget réel, ni capacité de restauration.
- **Compiler puis qualifier avant activation** : retenu ; permet l'exploration
  et la comparaison sans confondre proposition, exécution et promotion.

## Risques et portes de validation

Les principaux risques sont l'optimisation d'un score déclaratif, la corrélation
des vérificateurs, le surapprentissage à une famille de tâches, les observations
perdues en concurrence et l'explosion combinatoire des recettes. Borner les
candidats, enregistrer les probabilités de choix et les coûts, injecter des
preuves trompeuses, des pannes et une dérive de distribution. Comparer les recettes
sur tâches appariées et familles tenues à l'écart, avec oracle indépendant,
abstention et contrôles négatifs. Un résultat de compilation ou de dispatch seul
reste une preuve de mécanisme, jamais un gain causal.

La stratégie détaillée et les métriques de qualification figurent dans
`docs/02-orchestration/morphogenese-strategie-adaptative.md`.
