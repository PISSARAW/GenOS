# Natural Search Control Plane — Senseur de progrès causal

## Principe

GenOS ne doit pas seulement mesurer **l'entropie des actions**.
Il doit mesurer **si les actions produisent du progrès causal**.

| Axe | Signification |
| --- | --- |
| Variation comportementale | diversité des outils, commandes, étapes |
| Progrès causal | gain de preuve, réduction d'incertitude, contraintes résolues, avancée objectif |

Ces deux axes définissent quatre régions exploitables :

|  | Progrès élevé | Progrès faible/nul |
| --- | --- | --- |
| Variabilité faible | exploitation productive | boucle / fixation mécanique |
| Variabilité forte | exploration productive | exploration panique |

Un **cinquième état** est crucial :

- **Hypothesis lock-in** : actions variées, hypothèse centrale inchangée,
  aucun gain de preuve, aucune réduction d'incertitude.
  C'est le piège qui échappe à la simple mesure d'entropie.

## Interface SearchProgress

```ts
SearchProgress {
  evidenceGain
  uncertaintyReduction
  constraintsResolved
  verifiedArtifactDelta
  objectiveDelta
  hypothesisInformationGain

  tokensConsumed
  timeConsumed
  costConsumed
}
```

**searchYield** = progrès utile pondéré / ressources consommées.

## Invariant testé

Le test `test/search/test_causal_progress.js` vérifie que :

- 20 actions différentes, **zéro** preuve, **zéro** réduction d'incertitude,
  **zéro** objectif → **stagnation détectée** (rendement de recherche ≈ 0).
- Un vrai rapport d'évidence améliore searchYield.
- Un coût élevé pour un gain faible → rendement faible.
- Rendements décroissants détectables entre deux pas.
- Fenêtre se réinitialise partiellement après événement terminal.

## Rapport de recherche

Chaque fenêtre produit :

```json
{
  "window": {
    "evidenceGain": 0.31,
    "uncertaintyReduction": 0.12,
    "constraintsResolved": 1,
    "objectiveDelta": 0.08,
    "searchYield": 0.18,
    "steps": 20
  },
  "global": { ... },
  "diagnostics": {
    "diminishingReturns": true,
    "objectiveProgress": -0.1
  }
}
```

## Intégration prévue

Ce service sera injecté dans `agentProcessEventPipeline.js` après
le Swarm Sentinel, pour fournir au contrôleur de recherche naturelle
un signal plus riche que l'entropie seule.
