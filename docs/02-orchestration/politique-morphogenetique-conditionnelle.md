# Politique morphogénétique conditionnelle

- **Statut** : Implémenté, consultatif
- **Portée** : compilation d'un besoin en représentation, recette, workers, preuves et budget
- **Dernière revue** : 2026-10-15

`compileConditionalMorphogenesisPolicy` compile un diagnostic en politique bornée.
Elle propose une représentation (`task_graph`, `hypothesis_set`, `causal_graph`,
`provenance_graph` ou `constraint_graph`), puis réutilise le générateur et le classeur
des topologies pour comparer la topologie courante, des variants et des compositions
admissibles. Les phases sont associées aux méthodes natives et aux kinds de workers
compatibles avec les affectations et capacités fournies.

La politique lie des obligations de preuve au diagnostic, réserve des parts du budget
à l'exploration, la résolution et la vérification, et pose des conditions de
réévaluation pour la dérive, la stagnation, la provenance contestée ou un reçu de
résolution. `reevaluateConditionalMorphogenesisPolicy` recompile à partir de la
nouvelle observation et du budget restant. Un reçu arrête la boucle seulement s'il
est vérifié et correspond au périmètre demandé.

Le classement reste consultatif : les estimations non calibrées conduisent à conserver
`NO_CHANGE`, et aucune recette n'autorise un dispatch ou une transition. L'appelant
doit faire respecter l'autorité, les leases, la disponibilité, la persistance des
époques et l'exécution des preuves. Voir [ADR 0544](../adr/0544-politique-morphogenetique-conditionnelle.md)
et [la stratégie adaptative](morphogenese-strategie-adaptative.md).
