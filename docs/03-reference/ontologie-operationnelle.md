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

Les opérations d'analyse (`comparePossibleWorlds`, `createWorldReceipt`,
`verifyWorldReceipt`, `evaluateCausalDependence` et les contrôles de continuité)
retournent aussi le contrat `genos.philosophy-analysis/v1`. Ce contrat ajoute la
provenance, l'incertitude, les éléments de preuve et
`promotionEligible: false`. Il normalise la forme de sortie sans transformer
une intégrité technique ou une simulation causale en preuve du monde réel.

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

Cette opération peut recevoir un `modalModel` et un `modalFormula` facultatifs.
Le modèle est évalué par le moteur modal borné et retourné comme contexte
auxiliaire. Le verdict causal reste une simulation interprétative, référencée
par `worldReference.hypothetical`, et son `epistemic_context` conserve la
provenance incomplète tant qu'une preuve vérifiée n'est pas fournie.

Un reçu vérifié atteste l'intégrité du payload enregistré. Il ne prouve pas que
le scénario simulé s'est produit dans le monde réel.

Les migrations ontologiques sont exécutées au bootstrap, y compris sur une base
neuve. Le test `test_ontology_tenant_runtime_integration.js` vérifie la
séparation entre deux tenants, la création d'un reçu et sa vérification.
Le test `test_ontology_analysis_contract.js` couvre en plus le contrat commun,
le refus d'un monde hors scope, la détection d'un payload altéré et le pont
causal-modal.

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
