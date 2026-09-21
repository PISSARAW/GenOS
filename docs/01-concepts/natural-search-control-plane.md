# Natural Search Control Plane

- **Statut** : Partiel — Phases 1–5 implémentées comme services isolés et couvertes par tests unitaires ; intégration runtime et actionnement des processus encore absentes.
- **Portée** : `backend/src/services/search/*.js`, `backend/tests/search/test_*.js`, `docs/architecture/natural-search-control-plane.md`.
- **Dernière revue** : 2026-09-21.

## Definition

Le **Natural Search Control Plane** est la couche de pilotage qui unifie les mécanismes biomimétiques de GenOS autour d'une idée centrale :

> **Nature is not a database of solutions. Nature is a collection of search processes.**

GenOS ne doit pas devenir une collection de recettes du type « abeilles pour X », « loups pour Y », « axolotl pour Z ». Le biomimétisme doit porter sur **la dynamique de recherche** : comment un système détecte que son comportement actuel ne produit plus de valeur, modifie son comportement, augmente ou réduit la variation, conserve les essais utiles, abandonne les niches stériles et transmet ce qui a marché.

Ce n'est pas un module d'IA supplémentaire. C'est un plan de contrôle qui, au-dessus des mécanismes existants (Swarm Sentinel, foraging, resilience, évolution, immunité), **sélectionne quel processus de recherche activer** en fonction de l'état causal de l'environnement.

Le point d'entrée applicatif est le service [naturalSearchController.js](../../backend/src/services/search/naturalSearchController.js). Les composants sous-jacents sont [causalProgressService.js](../../backend/src/services/search/causalProgressService.js), [entropyProgressClassifier.js](../../backend/src/services/search/entropyProgressClassifier.js), [hypothesisLedgerService.js](../../backend/src/services/search/hypothesisLedgerService.js) et [searchPressureService.js](../../backend/src/services/search/searchPressureService.js).

## Objectifs et frontières

Le plan de contrôle vise à rendre un agent conscient de sa propre efficacité de recherche :

- **observer** les événements du runtime (Swarm Sentinel, rapports d'évidences, traces) ;
- **mesurer le progrès causal** — pas seulement la diversité comportementale ;
- **détecter les hypothèses falsifiées** et les budgets mal alloués ;
- **estimer la pression de recherche** — à quel point la méthode actuelle doit changer ;
- **sélectionner un processus** — continuer, forager, plastifier, muter, spécier, évoluer.

Une action différente ne suffit pas à déclarer de l'exploration : si `evidenceGain ≈ 0` et `uncertaintyReduction ≈ 0`, GenOS sait que **l'agent bouge mais ne cherche plus efficacement**. C'est l'apport fondamental du plan de contrôle par rapport au Swarm Sentinel actuel.

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

Et à une échelle supérieure :

$$
\boxed{
\text{GenOS n'évolue pas pour trouver une réponse.}
}
$$

$$
\boxed{
\text{GenOS fait évoluer sa manière de chercher.}
}
$$

## Cartographie des processus

```
                       ┌─────────────────────┐
                       │   ENVIRONNEMENT     │
                       │ problème + preuves  │
                       └─────────┬───────────┘
                                 ↓
                       ┌─────────────────────┐
                       │  SWARM SENTINEL     │
                       │ entropy comportement│
                       └─────────┬───────────┘
                                 ↓
                       ┌─────────────────────┐
                       │ CAUSAL PROGRESS     │ ← Phase 1
                       │     SENSOR          │
                       └─────────┬───────────┘
                                 ↓
                       ┌─────────────────────┐
                       │ HYPOTHESIS LEDGER   │ ← Phase 3
                       │  falsification      │
                       └─────────┬───────────┘
                                 ↓
                       ┌─────────────────────┐
                       │ SEARCH PRESSURE     │ ← Phase 4
                       │     MODEL           │
                       └─────────┬───────────┘
                                 ↓
                       ┌─────────────────────┐
                       │ NATURAL SEARCH      │ ← Phase 5
                       │   CONTROLLER        │
                       └───┬─────────┬───────┘
                           ↓         ↓
                    exploitation  exploration
                           ↓         ↓
                    foraging      plasticité
                           ↓         ↓
                    clonal search  hypermutation
                           ↓         ↓
                    speciation    evolution
```

## Phase 1 — Causal Progress Sensor

### Concept

GenOS mesure déjà l'entropie des actions. Il lui manquait l'axe du **progrés causal**. Le Causal Progress Sensor construit un vecteur `SearchProgress` à partir des événements du runtime :

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

Il calcule ensuite :

$$
\text{searchYield} = \frac{\text{progrès utile pondéré}}{\text{ressources consommées}}
$$

### Implémentation

Fichier : [backend/src/services/search/causalProgressService.js](../../backend/src/services/search/causalProgressService.js)

Classe `CausalProgressService` :
- maintient une `SearchProgressWindow` glissante (90 s) ;
- agrège les progrès et les coûts sur la fenêtre et globalement ;
- produit un rapport `diagnostics` (rendements décroissants, stagnation).

### Tests et invariant

Test : [backend/tests/search/test_causal_progress.js](../../backend/tests/search/test_causal_progress.js)

**Invariant clé** : 20 actions différentes mais **zéro preuve, zéro réduction d'incertitude, zéro objectif** → **stagnation détectée** (searchYield ≈ 0). Aujourd'hui le Swarm Sentinel considérerait ce comportement comme de l'exploration.

## Phase 2 — Entropie × Progression

### Concept

Fusionner l'entropie comportementale (Swarm Sentinel) et le progrès causal (Sensor) pour produire **cinq états invariants** :

| | Progression élevée | Progression faible |
| --- | --- | --- |
| **Faible entropie** | `PRODUCTIVE_EXPLOITATION` | `MECHANICAL_STAGNATION` |
| **Forte entropie** | `PRODUCTIVE_EXPLORATION` | `PANIC_EXPLORATION` |
| **Entropie moyenne** | — | `HYPOTHESIS_LOCK_IN` |

`HYPOTHESIS_LOCK_IN` est l'état qui échappe à la simple détection d'entropie : **actions variées + hypothèse centrale inchangée + aucun gain de preuve**.

### Implémentation

Fichier : [backend/src/services/search/entropyProgressClassifier.js](../../backend/src/services/search/entropyProgressClassifier.js)

Fonction `classifySearchState(agentId, causalReport, entropyMetrics)` :
- mappe `(entropie, progrès)` vers un des cinq états via `resolveRegion()` ;
- les données d'entropie sont injectables (tests) ou lues depuis Swarm Sentinel.

### Tests et invariant

Test : [backend/tests/search/test_entropy_progress_classifier.js](../../backend/tests/search/test_entropy_progress_classifier.js)

Quatre scénarios validés : `AAAAAAA + progrès` → exploitation, `ABCDEFG + progrès` → exploration productive, `AAAAAAA + zéro progrès` → stagnation mécanique, `ABCDEFG + zéro progrès` → exploration panique.

## Phase 3 — Hypothesis Ledger

### Concept

GenOS doit savoir **dans quelle idée l'agent est actuellement enfermé**. Le Ledger maintient un ensemble d'hypothèses avec :

```yaml
id
parent_hypothesis_id
agent_id
branch_id

statement
prediction
falsification_condition

confidence         ∈ [0,1]
uncertainty        ∈ [0,1]
evidence_for
evidence_against

status:
  proposed
  active
  weakened
  falsified
  supported
  suspended

created_at
last_tested_at
last_progress_at
```

Un agent ne pense plus « le problème vient probablement du cache ». Il produit :

```
H17 — Cache invalidation is causing stale responses.
  Prediction : Disabling cache should eliminate reproduction.
  Falsification : Bug persists with cache bypassed.

E41 : Cache bypassed. Bug still reproduced.
→ H17 = FALSIFIED
```

### Invariant clé

> Une hypothèse falsifiée ne peut pas recevoir > 80 % du budget sans nouvelle preuve.

### Implémentation

Fichier : [backend/src/services/search/hypothesisLedgerService.js](../../backend/src/services/search/hypothesisLedgerService.js)

Classe `HypothesisLedger` :
- gestion du cycle de vie (propose → startTest → addEvidence → falsify) ;
- `detectLockIn()` : détecte une hypothèse active testée récemment mais sans progrès ;
- `checkFalsifiedBudgetViolation()` : protège contre la réallocation excessive ;
- système d'événements (`HYPOTHESIS_PROPOSED`, `HYPOTHESIS_FALSIFIED`, …).

### Tests

Test : [backend/tests/search/test_hypothesis_ledger.js](../../backend/tests/search/test_hypothesis_ledger.js)

## Phase 4 — Search Pressure

### Concept

Variable dynamique :

$$
P_{search}(t) \in [0,1]
$$

Représente **à quel point l'environnement indique que la méthode de recherche actuelle doit changer**.

**Augmente avec** : stagnation, incertitude persistante, hypothèses falsifiées, contradictions, rendements décroissants, échecs.

**Diminue avec** : nouvelles preuves, réduction d'incertitude, contraintes résolues, progression vers l'objet.

### Règle d'escalade

| Pression | Processus |
| --- | --- |
| P < 0.20 | `CONTINUE` (homéostasie) |
| 0.20–0.40 | `CHEMOTAXIE / FORAGE` |
| 0.40–0.60 | `PLASTICITÉ PHÉNOTYPIQUE` |
| 0.60–0.75 | `CLONAL SEARCH` |
| 0.75–0.90 | `STRESS HYPERMUTATION` |
| > 0.90 | `SPÉCIATION / RESTART` |

Les seuils doivent être appris/calibrés expérimentalement.

### Implémentation

Fichier : [backend/src/services/search/searchPressureService.js](../../backend/src/services/search/searchPressureService.js)

Classe `SearchPressureModel` :
- accumulation avec bornes (`update()`) ;
- causes attachées (`LOW_INFORMATION_GAIN`, `HYPOTHESIS_FALSIFIED`, …) ;
- rayon d'escalade recommandé (`MINIMAL`, `LOCAL`, `MEDIUM`, `STRUCTURAL`, `RADICAL`).

### Tests

Test : [backend/tests/search/test_search_pressure.js](../../backend/tests/search/test_search_pressure.js)

## Phase 5 — Natural Search Controller

### Concept

Assemble les mécanismes précédents. **Ne résout rien lui-même** — sélectionne **comment chercher ensuite**.

Pseudo-logique :

```
pression faible                                   → CONTINUE
rendement marginal faible                        → FORAGE (quitter le patch)
pression modérée                                 → PLASTICITÉ
hypothèse prometteuse + progrès lent             → CLONAL_AFFINITY_SEARCH
hypothèse falsifiée / contradiction              → REPLAY_CAUSAL
pression forte                                   → STRESS_HYPERMUTATION
plusieurs échecs indépendants                    → SPÉCIATION
stagnation au niveau lignée                      → ÉVOLUTION
```

Cela évite de coder `if (bug) useWolf(); if (research) useAnt();` qui serait précisément l'inverse de la philosophie.

### Implémentation

Fichier : [backend/src/services/search/naturalSearchController.js](../../backend/src/services/search/naturalSearchController.js)

Classe `NaturalSearchController` :
- combine `SearchPressureModel`, `classifySearchState` et `CausalProgressService` ;
- `selectProcess(ctx)` produit `{ process, pressure, classification, diagnostics, causes }` ;
- historique des sélections pour analyse.

### Tests

Test : [backend/tests/search/test_natural_search_controller.js](../../backend/tests/search/test_natural_search_controller.js)

## Phases suivantes (non implémentées)

| Phase | Objet |
| --- | --- |
| 6 — Hypermutation structurée | Remplacer la mutation lexicale par mutation de `SearchGenome` (hypothèse, stratégie, topologie, modèle, objectif) |
| 7 — Affinité cognitive | Connecter `genos-immune` aux hypothèses de recherche (antigène = contrainte, anticorps = hypothèse candidate) |
| 8 — Foraging général | Transformer `WebPatch` en `SearchPatch` (hypothèse, branche, outil, paramètre) |
| 9 — Replay causal | Restaurer au premier engagement causal post-falsification |
| 10 — Mémoire négative | Phéromones répulsives avec portée, confiance, TTL, conditions |
| 11 — Évolution des processus | Connecter le SearchGenome au moteur Rust (`crates/genos-orchestrator/src/evolution.rs`) |
| 12 — Transmission / plasmides | Transmettre les processus de recherche validés à d'autres agents |

## Vitesses d'adaptation

| Échelle GenOS | Analogie naturelle | Intervention |
| --- | --- | --- |
| événements | homéostasie | ajuster budget/intensité |
| quelques actions | comportement / chemotaxie | changer légèrement direction |
| dizaines d'actions | foraging | quitter une zone peu rentable |
| épisode | plasticité | modifier le phénotype |
| échec local | système immunitaire | cloner + varier localement |
| stagnation forte | stress mutagenesis | augmenter temporairement la variation |
| branche | apoptose | tuer la trajectoire |
| plusieurs branches | niche/spiation | explorer des familles différentes |
| plusieurs missions | évolution | sélectionner/recombiner |
| long terme | mémoire/culture | transmettre les processus efficaces |

## Recherche fondamentale

Cette architecture s'appuie sur quatre principes biologiques validés :

1. **Chemotaxie bactérienne** — boucle rapide perception → adaptation → changement de comportement ([Spiro, Parkinson & Othmer 1997](https://pmc.ncbi.nlm.nih.gov/articles/PMC23809/)).
2. **Plasticité développementale** — modification du phénotype sans changement génétique ([Schwab, Casasa & Moczek 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6335315/)).
3. **Mutagenèse de stress** — la variation augmente transitoirement sous conditions défavorables ([Foster 2007](https://pmc.ncbi.nlm.nih.gov/articles/PMC2747772/)).
4. **Maturation d'affinité** — recherche locale par clonage + mutation + sélection ([Bowers, Boyle & Damoiseaux 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6497467/)).

## Modèle SearchGenome

Chaque trajectoire possède un génome de recherche explicite :

```yaml
search_genome:
  hypothesis_family:
    - cache_state
  decomposition:
    strategy: causal_debugging
  operators:
    - inspect_logs
    - reproduce
    - isolate_component
  evidence_policy:
    require_counterexample: true
  topology:
    isolated_worker
  model_profile:
    reasoning: high
  exploration:
    radius: 0.18
    novelty_weight: 0.12
  memory:
    negative_trails: true
```

Quand GenOS mute, il peut transformer `causal_debugging` en `state_differential_analysis`, ou `cache hypothesis` en `race condition hypothesis`. Cela produit une **vraie variation comportementale**, pas une variation linguistique.

## Natural Search Memory

Le dernier niveau est crucial. La nature accumule les adaptations. GenOS doit apprendre non seulement « la solution X a marché » mais « le processus de recherche Y a marché dans l'environnement Z ».

Exemple :

```yaml
environment_signature:
  flaky integration test
  nondeterministic timing
  high state uncertainty

successful_search_process:
  reproduce
  temporal fork
  causal bisection
  replay
  independent verification
```

Ce qui est mémorisé n'est pas « la réponse était ligne 48 » mais « pour ce type d'espace, cette dynamique de recherche a été efficace ».

## Configuration et vérification

Vérifier les comportements critiques avec les tests :

```bash
cd backend && \
  node tests/search/test_causal_progress.js && \
  node tests/search/test_entropy_progress_classifier.js && \
  node tests/search/test_hypothesis_ledger.js && \
  node tests/search/test_search_pressure.js && \
  node tests/search/test_natural_search_controller.js
```

## Limites connues

- Le Causal Progress Sensor utilise des événements du runtime qui doivent être alimentés explicitement (pas encore branché sur `agentProcessEventPipeline.js`).
- L'Hypothèse Ledger est en mémoire uniquement — pas de persistance SQLite pour l'instant.
- Les seuils de pression sont déclarés, pas encore appris expérimentalement.
- Les phases 6–12 (mutation structurée, affinity maturation, foraging général, replay causal, évolution des processus, transmission) ne sont pas implémentées.
