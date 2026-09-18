# Contrat de l'ontologie opérationnelle

Les capacités ontologiques sont exposées via `genos_philosophy` avec
`operation: "queryOntology"`. Le nom de l'opération interne est transmis dans
`arguments.ontologyOperation`.

Opérations disponibles pour la première tranche :

- `defineOther`, `recordEncounter`, `listOtherRelations` et
  `evaluateAlterityBoundary` ;
- `recordContinuityObservation`, `classifyContinuity` et
  `detectContinuityTransition` ;
- `createPossibleWorld`, `getPossibleWorld`, `listPossibleWorlds`,
  `addWorldAccessibility` et `comparePossibleWorlds`.

Ces opérations produisent des analyses et des structures hypothétiques. Elles
ne déclenchent ni autorisation, ni promotion, ni exécution d'outil. Les mondes
possibles restent `hypothetical` et les résultats non corroborés portent le
statut `unverified`.

La tranche métaphysique expose également des analyses bornées pour le réalisme
spéculatif, les modèles esprit-matière et les propriétés de deuxième ordre.
Elles restent descriptives : aucun service ne conclut à la conscience, à une
réalité indépendante ou à une position métaphysique vraie.

Les critères d'identité d'un être peuvent être ajustés par
`updateIdentityCriteria`. Toute modification doit rester explicite et être
évaluée ensuite par `checkIdentityContinuity` ; elle ne réécrit pas l'historique
des événements d'identité.

Les extensions avancées ajoutent :

- `detectPhaseTransition` pour qualifier un franchissement de seuil ;
- `createWorldReceipt` et `verifyWorldReceipt` pour hacher et vérifier un
  résultat de monde possible ;
- `evaluateCausalDependence` pour relier un monde hypothétique au calcul causal
  existant.

Un reçu vérifié atteste l'intégrité du payload enregistré. Il ne prouve pas que
le scénario simulé s'est produit dans le monde réel.

Exemple :

```json
{
  "operation": "queryOntology",
  "arguments": {
    "ontologyOperation": "createPossibleWorld",
    "ontologyArguments": {
      "parentWorldId": "world-main",
      "assumptions": [{ "key": "budget", "value": 1000 }]
    }
  }
}
```
