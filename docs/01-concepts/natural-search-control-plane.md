# Natural Search Control Plane

- **Statut** : Partiel — Phases 1–5 implémentées comme services isolés et couvertes par tests unitaires ; intégration runtime et actionnement des processus encore absentes.
- **Portée** : `backend/src/services/search/*.js`, `backend/tests/search/test_*.js`, `docs/adr/0032-natural-search-control-plane.md`.
- **Dernière revue** : 2026-09-21.

## Définition

Le **Natural Search Control Plane** est la couche de pilotage qui unifie les mécanismes biomimétiques de GenOS autour d'une idée centrale :

> **Nature is not a database of solutions. Nature is a collection of search processes.**

GenOS ne doit pas devenir une collection de recettes du type « abeilles pour X », « loups pour Y », « axolotl pour Z ». Le biomimétisme doit porter sur **la dynamique de recherche** : comment un système détecte que son comportement actuel ne produit plus de valeur, modifie son comportement, augmente ou réduit la variation, conserve les essais utiles, abandonne les niches stériles et transmet ce qui a marché.

Le point d'entrée applicatif est le service [naturalSearchController.js](../../backend/src/services/search/naturalSearchController.js). Les composants sous-jacents sont [causalProgressService.js](../../backend/src/services/search/causalProgressService.js), [entropyProgressClassifier.js](../../backend/src/services/search/entropyProgressClassifier.js), [hypothesisLedgerService.js](../../backend/src/services/search/hypothesisLedgerService.js) et [searchPressureService.js](../../backend/src/services/search/searchPressureService.js).

## Principe fondamental

$$
\boxed{
\text{Observe}
\rightarrow
\text{Measure progress}
\rightarrow
\text{Sense pressure}
\rightarrow
\text{Change search process}
\rightarrow
\text{Test}
\rightarrow
\text{Remember}
}
$$

## Phases implémentées

### Phase 1 — Causal Progress Senseur

Mesure le progrès causal au-delà de l'entropie comportementale. Vecteur `SearchProgress` :

```typescript
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
$$

**Formule** :
$$
\text{searchYield} = \frac{\text{progrès pondéré}}{\text{pression normalisée par budget}}
$$

### Phase 2 — Entropie × Progression

| | Progression élevée | Progression faible |
| --- | --- | --- |
| **Faible entropie** | PRODUCTIVE_EXPLOITATION | MECHANICAL_STAGNATION |
| **Forte entropie** | PRODUCTIVE_EXPLORATION | PANIC_EXPLORATION |
| **Entropie moyenne** | — | MEDIUM_VARIATION_STAGNATION |

### Phase 3 — Hypothesis Ledger

Registre d'hypothèses avec :
- **Confiance bayésienne** : `p = (α + E₊) / (α + β + E₊ + E₋)` avec prior (1,1)
- **Incertitude** : entropie normalisée `U = -(p·log₂p + (1-p)·log₂(1-p))`
- **Preuves structurées** : force, provenance, fiabilité, indépendance
- **Détection de lock-in** : via `Ledger.detectLockIn()`

### Phase 4 — Search Pressure

Pression dynamique recalculée avec inertie :
$$
P_t = \lambda \cdot P_{t-1} + (1-\lambda) \cdot P_{\text{observed}}
$$

### Phase 5 — Natural Search Controller

Sélection du processus :
- CONTINUE, FORAGE, PLASTICITÉ, CLONAL_AFFINITY_SEARCH
- REPLAY_CAUSAL, STRESS_HYPERMUTATION, SPECIATION

**Hystérésis** : seuils d'entrée/sortie différents pour éviter l'oscillation.

## Limites connues

- **Intégration runtime** : `agentProcessEventPipeline.js` n'utilise pas encore le système
- **Actuator** : aucun service `NaturalSearchActuator` pour exécuter les décisions
- **Persistance** : Ledger en mémoire uniquement (pas de table SQLite)
- **Évolution** : le processus EVOLUTION n'est pas encore sélectionnable
- **E2E** : pas de test end-to-end complet

## Références biologiques

1. Chemotaxie bactérienne (Spiro, Parkinson & Othmer 1997)
2. Plasticité développementale (Schwab, Casasa & Moczek 2019)
3. Mutagenèse de stress (Foster 2007)
4. Maturation d'affinité (Bowers, Boyle & Damoiseaux 2018)

## Voir aussi

- [ADR 0032 — Natural Search Control Plane](../../docs/adr/0032-natural-search-control-plane.md)
