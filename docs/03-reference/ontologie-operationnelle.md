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
