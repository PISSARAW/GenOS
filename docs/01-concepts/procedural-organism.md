# Organisme Procédural — Système de Circuits Adaptatifs

- **Statut** : Implémenté — 24 services backend couvrant l'ensemble du cycle de vie d'une procédure (plasticité, consolidation, pruning, inhibition, sélection, épigénétique, immunité, apoptose, fossilisation, etc.).
- **Portée** : `backend/src/services/procedural*Service.js` (24 services), `backend/tests/test_procedural_organism_*.js` (3 fichiers de tests), `docs/08-philosophie.md` (section 27).
- **Dernière revue** : 2026-09-21.

## 1. Définition du domaine

L'**organisme procédural** est, dans GenOS, un **système de circuits adaptatifs** dont le squelette structurel est un graphe, mais dont la compétence effective résulte de l'interaction entre plusieurs couches biologiquement inspirées. Il ne s'agit pas d'un graphe logique figé, mais d'une entité vivante soumise à plasticité, consolidation, inhibition, homéostasie, immunité, épigénétique, sélection écologique, dormance, apoptose et héritage sous preuve.

Comme tout terme biologique dans GenOS (voir [docs/README.md](../README.md) et [.genos.md](../../.genos.md)), « organisme procédural » sert à **organiser un invariant de calcul** — un comportement adaptatif présent avant toute donnée d'expérience, hérité, modulé par l'expérience — et **non** à revendiquer une équivalence biologique, une conscience ou une autonomie de décision.

### Ce que le modèle n'est PAS

Le papier de référence (et les graphes procéduraux classiques) modélise :

```text
Procedural Graph
  → mutations
  → benchmark
  → promotion
```

Ce modèle est insuffisant car il traite la procédure comme une structure logique statique, évaluée uniquement par son résultat. Il n'y a pas de mémoire de *pourquoi* une transition fonctionne, pas de distinction entre ce qui est appris et ce qui est inné, pas de mécanisme de rétroaction structuré.

### Ce que le modèle EST

GenOS modélise l'organisme procédural comme un système complet :

```text
expérience
  ↓
plasticité synaptique
  ↓
circuits procéduraux
  ↓
consolidation
  ↓
sélection / inhibition
  ↓
adaptation épigénétique
  ↓
héritage éventuel
```

Le **Procedural Genome** ne contient pas les procédures apprises. Il contient les **règles d'apprentissage** qui permettent à l'agent d'acquérir des procédures.

---

## 2. Les 24 mécanismes et leur ancrage GenOS

| # | Mécanisme biologique | Invariant computationnel | Service |
| --- | --- | --- | --- |
| 1 | **Génome ≠ procédure** (inné vs acquis) | le génome code la politique d'acquisition, pas la procédure | `proceduralGenomePolicyService` |
| 2 | **Synapses procédurales** (arêtes plastiques) | chaque transition porte un poids `w`, des compteurs de potentiation/dépression, une trace d'activation et un taux de succès | `proceduralSynapseService` |
| 3 | **LTP/LTD procédurale** | `Δw = η·reward` avec une récompense riche (succès, preuve, coût, sécurité, effet causal) | `proceduralPlasticityService` |
| 4 | **Consolidation** (hippocampe → cortex) | les épisodes répétés sont extraits en golden paths stables pendant le cycle de sommeil | `proceduralConsolidationService` |
| 5 | **Pruning synaptique** | un état multi-niveaux `active → weakened → dormant → candidate_for_pruning → pruned` avant suppression | `proceduralPruningService` |
| 6 | **Inhibition** (Dead Ends actifs) | certaines transitions sont inhibibles sous conditions, pas seulement mémorisées comme négatives | `proceduralInhibitionService` |
| 7 | **Sélection d'action** (ganglions de la base) | à partir de plusieurs transitions candidates, une sélection compétitive compute un score `A_i` et produit un gagnant | `proceduralActionSelectionService` |
| 8 | **Erreur de prédiction** (signal dopaminergique) | `δ = R_observé − R_attendu` déclenche LTD, augmentation de plasticité locale ou recherche de mutation | `proceduralPredictionErrorService` |
| 9 | **Fitness multi-objectif** | `F = w₁·succès + w₂·robustesse + w₃·preuve + w₄·généralisation − coût − risque − complexité` | `proceduralFitnessService` |
| 10 | **Plasticité homéostatique** | `w′ = w · target/observed` empêche la domination irréversible d'une seule procédure | `proceduralHomeostaticPlasticityService` |
| 11 | **Expression épigénétique** | le même genome s'exprime différemment selon l'environnement (`enabled / conditional / silenced`) | `proceduralEpigeneticService` |
| 12 | **Méthylation procédurale** | une marque cible une arête/procédure, avec un déclencheur environnemental et une provenance | `proceduralMethylationService` |
| 13 | **Inspection immunitaire innée** | toute mutation est inspectée avant sandbox : bypass de politique, suppression de vérification, élévation de permissions, accès hors lease, réduction de preuves, contournement sandbox | `proceduralImmuneInspectionService` |
| 14 | **Mémoire immunitaire adaptative** | les mutations rejetées forment des signatures rappelées pour un rejet rapide des mutations similaires | `proceduralAdaptiveImmuneMemoryService` |
| 15 | **Mutation et sélection naturelle** | variants générés, évalués par environnement, survivors sélectionnés — pas de suppression automatique des non-gagnants | `proceduralMutationSelectionService` |
| 16 | **Diversité de niche** (anti-darwinisme naïf) | plusieurs lignées peuvent coexister si elles occupent des niches procédurales différentes | `proceduralEcologicalDiversityService` |
| 17 | **Populations procédurales** (Biome) | le biome gère des populations de genomes par niche (debugging, recherche, planification, …) | `proceduralBiomePopulationService` |
| 18 | **Niches écologiques** | la fitness est évaluée dans un environnement délimité, pas globalement | `proceduralEcologicalNicheService` |
| 19 | **Symbiose procédurale** (Holobionte) | une procédure hôte peut composer avec des sous-procédures spécialisées (sécurité, mémoire, vérification) | `proceduralHolobionteService` |
| 20 | **Propagation rhizomique** | fragments utiles se propagent entre agents après validation locale, pas par copie directe | `proceduralRhizomePropagationService` |
| 21 | **Métapopulation** | plusieurs populations conservent des familles de procédures différentes ; le collapsus d'une population laisse les autres recoloniser | `proceduralMetapopulationService` |
| 22 | **Apoptose procédurale** | déclenchée par `fitness < τ ∧ risk > ρ ∧ recoveryAttempts > N`, avec autopsie puis fossilisation | `proceduralApoptosisService` |
| 23 | **Cryptobiose** | procédures inutiles temporairement entrent en veille quasi-zéro, réactivables si la niche revient | `proceduralCryptobiosisService` |
| 24 | **Fossilisation / phylogénie** | à la mort, genotype, phenotype, niche, mutations, fitness history, causal evidence, cause de fermeture et descendants sont archivés | `proceduralFossilizationService` |

---

## 3. Le squelette vs l'organisme

Le papier (et les graphes classiques) ne modélisent que le squelette :

```text
Procedural Graph
  → mutations
  → benchmark
  → promotion
```

GenOS le transforme en organisme complet :

```text
Procedural Organism
  ├── structural graph (squelette)
  ├── synaptic weights (w, LTP/LTD)
  ├── excitatory edges
  ├── inhibitory edges
  ├── plasticity state (potentiation / depression / lastActivation)
  ├── epigenetic expression (marks, milieu dépendant)
  ├── fitness history (multi-objectif, environnementale)
  ├── niche (population, biome)
  ├── immune status (inné + adaptatif)
  ├── lineage (descendants, fossilisation)
  └── energy budget (coût, complexité, token)
```

Le graphe du papier devient seulement son **squelette**.

---

## 4. La boucle de l'organisme procédural

```text
ENVIRONMENT
  ↓
procedural niche
  ↓
┌─────────────┐
│ PROCEDURAL  │
│  ORGANISM   │
└──────┬──────┘
       │
action selection (ganglions de la base)
       ↓
   execution
       ↓
    outcome
       │
prediction error δ
       │
┌──────┼──────┬──────┐
↓      ↓      ↓      ↓
LTP    LTD  inhibition
│      │      │      │
└──────┼──────┴──────┘
       ↓
  plasticity (Δw = η·reward, reward riche)
       │
┌──────┴──────┐
↓             ↓
consolidation  mutation
(sleep/replay)  (surprise-based)
│             │
↓             ↓
reproduced    candidate variant
path                  │
              immune inspection
                     │
              sandbox / challenge
                     │
              causal trials + fitness
                     │
           ┌─────────┴─────────┐
           ↓                   ↓
        survive             reject
           │                   │
           ↓                   ↓
      reproduce        immune memory
           │
           ↓
        lineage
```

---

## 5. Détail des mécanismes

### 5.1 Point 1 — Le génome distingue inné et acquis

**Concept biologique.** Tout comportement n'est pas directement inscrit dans les gènes. Le génome prédispose ; l'expérience façonne.

**Invariant computationnel.** Le genome code la *politique d'acquisition*, pas la procédure elle-même.

**Exemple :**

```yaml
procedural_policy:
  plasticity:
    enabled: true
    learning_rate: adaptive
  consolidation:
    threshold: 0.82
  pruning:
    enabled: true
  mutation:
    max_structural_change: 3
  inheritance:
    acquired_procedures: validated_only
```

C'est biologiquement cohérent :

```text
Agent Genome
       │
       │ prédispose
       ▼
Procedural Phenotype
       │
       │ expérience
       ▼
Procedural Memory
```

**Service :** `proceduralGenomePolicyService.js`

| Fonction | Rôle |
|---|---|
| `policyFrom(input)` | Fusionne une politique utilisateur avec les défauts |
| `genomeEncodesLearningRules(genome)` | Vérifie que le génome contient des règles d'apprentissage |
| `isInnate(genome)` | Distingue l'inné (règles) de l'acquis (procédures) |
| `learningRateFor(policy, episodes)` | Calcule η adaptatif |
| `consolidationThreshold(policy)` | Seuil de consolidation |
| `isInheritanceValidatedOnly(policy)` | N'hérite que des procédures validées |

---

### 5.2 Point 2 — Les arêtes deviennent des synapses procédurales

**Concept biologique.** Une synapse n'est pas un lien binaire. C'est une connexion pondérée, plastique, avec mémoire d'activation.

**Invariant computationnel.** Chaque transition porte un poids `w_{A,B}`, un compteur de potentiations/dépressions, une trace d'activation et un taux de succès.

**Exemple :**

```yaml
edge:
  from: reproduce_failure
  to: isolate_component
  plasticity:
    weight: 1.38
    potentiation_count: 17
    depression_count: 2
  last_activation:
    trajectory: T-718
  evidence:
    success_rate: 0.91
```

**Transition utile répétée → w↑. Transition nuisible → w↓.**

**Service :** `proceduralSynapseService.js`

| Fonction | Rôle |
|---|---|
| `defaultSynapse(from, to)` | Crée une synapse avec valeurs par défaut |
| `synapseFrom(edge)` | Normalise une arête en synapse |
| `activate(synapse, context)` | Enregistre une activation |
| `recordTrial(synapse, success)` | Met à jour les compteurs d'essais |
| `computeEffectiveWeight(synapse)` | Poids effectif (négatif si inhibitoire) |
| `lifecycleState(synapse, policy)` | État du cycle de vie |
| `isPrunable(synapse, policy)` | Vérifie si le cooldown de pruning est écoulé |
| `promoteToPruningCandidate(synapse)` | Marque comme candidat au pruning |

---

### 5.3 Point 3 — LTP/LTD procédurale

**Concept biologique.** LTP renforce une connexion utile ; LTD affaiblit une connexion nuisible.

**Invariant computationnel.** `Δw = η·reward` avec une récompense riche :

$$
reward = f(success, evidence, cost, safety, causalEffect)
$$

Pas simplement `task passed = +1`, sinon l'agent apprend à tricher.

**Formule :**

$$
\Delta w = \eta \cdot (0.30 \cdot success + 0.20 \cdot evidence + 0.12 \cdot (1-cost) + 0.13 \cdot safety + 0.13 \cdot causalEffect + 0.12 \cdot (1-|success-evidence|))
$$

Le dernier terme pénalise les cas où le succès est élevé mais la preuve faible (triche).

**Service :** `proceduralPlasticityService.js`

| Fonction | Rôle |
|---|---|
| `rewardFrom(context)` | Calcule la récompense riche |
| `deltaW(synapse, context, policy)` | Calcule le nouveau poids |
| `applyLTP(synapse, context, policy)` | Renforce (augmente w, incrémente potentiation) |
| `applyLTD(synapse, context, policy)` | Affaiblit (diminue w, incrémente dépression) |
| `predictionError(expected, observed)` | `δ = observed − expected` |
| `surpriseScore(pe, policy)` | Détermine si l'erreur est surprenante |

---

### 5.4 Point 4 — Consolidation (hippocampe → cortex)

**Concept biologique.** Au début, une procédure vient d'expériences spécifiques (mémoire épisodique). Puis le détecte une structure commune et la transforme en connaissance procédurale stable.

**Invariant computationnel.** Les épisodes répétés sont extraits en **golden paths** stables pendant le cycle de sommeil.

```text
Episodic Memory
      │
      │ replay / sleep
      ▼
Procedural Consolidation
      │
      ▼
Procedural Genome acquired layer
```

**Service :** `proceduralConsolidationService.js`

| Fonction | Rôle |
|---|---|
| `episodeFrom(input)` | Crée un épisode structuré |
| `extractCommonSubpath(episodes)` | Extrait le préfixe commun à plusieurs trajectoires |
| `consolidatePath(policy, episodes)` | Consolide en golden path si seuil atteint |
| `replaySummary(episodes)` | Statistiques de replay |

**Seuil de consolidation :** `successRate ≥ policy.consolidation.threshold` (défaut 0.82) ET `episodes.count ≥ policy.consolidation.minEpisodes` (défaut 3).

---

### 5.5 Point 5 — Pruning synaptique multi-niveaux

**Concept biologique.** L'élagage synaptique ne supprime pas immématement. Une synapse faiblement utilisée passe par des états intermédiaires.

**Invariant computationnel.** Cycle explicite :

```text
active → weakened → dormant → candidate_for_pruning → pruned
```

Cela permet de **réactiver** une procédure si l'environnement change.

**Service :** `proceduralPruningService.js`

| Fonction | Rôle |
|---|---|
| `pruneEligibility(synapse, policy)` | Évalue l'éligibilité au pruning |
| `weaken(synapse, policy)` | Avance d'un état dans le cycle |
| `revive(synapse, policy)` | Recule d'un état (réactivation) |
| `prune(synapse)` | Supprime définitivement |
| `pruneCandidates(synapses, policy)` | Traite un lot de candidats |

---

### 5.6 Point 6 — Inhibition (Dead Ends actifs)

**Concept biologique.** Le cerveau n'apprend pas seulement « A → B est bon ». Il apprend aussi « dans ce contexte, inhiber B ».

**Invariant computationnel.** Certain transitions sont **inhibibles** sous conditions, pas seulement mémorisées comme négatives.

```text
inspect_error
     │
     ├──────▶ reproduce_test
     │
     └──|──▶ patch_immediately
```

`──|` = inhibition.

**Service :** `proceduralInhibitionService.js`

| Fonction | Rôle |
|---|---|
| `inhibitoryEdgeFrom(input)` | Crée une arête inhibitrice |
| `isInhibitory(edge)` | Vérifie le type |
| `isInhibited(edge, context)` | Évalue si la condition d'inhibition est remplie |
| `inhibitionStrength(edge, context)` | Force de l'inhibition (0-1) |
| `effectiveTransitionScore(base, edge, context)` | Score réduit par l'inhibition |
| `trigger(edge, context)` | Enregistre un déclenchement |

---

### 5.7 Point 7 — Sélection d'action (ganglions de la base)

**Concept biologique.** Les ganglions de la base participent à la sélection d'actions concurrentes.

**Invariant computationnel.** Score de sélection :

$$
A_i = w_i \cdot 0.25 + contextMatch_i \cdot 0.20 + expectedUtility_i \cdot 0.20 + evidence_i \cdot 0.15 - risk_i \cdot 0.12 - inhibition_i \cdot 0.15 + bonus
$$

Puis **winner-take-most**. Le LLM peut toujours refuser le résultat, mais GenOS fournit une pression structurée.

**Service :** `proceduralActionSelectionService.js`

| Fonction | Rôle |
|---|---|
| `candidateAction(input)` | Normalise une action candidate |
| `activationScore(action, context)` | Calcule le score `A_i` |
| `selectActions(candidates, context, options)` | Sélectionne le(s) gagnant(s) |
| `competitiveInhibition(candidates, selectedIds)` | Augmente l'inhibition des non-gagnants |

---

### 5.8 Point 8 — Erreur de prédiction (signal dopaminergique)

**Concept biologique.** Pas une « émotion ». Un **prediction error**.

**Invariant computationnel.**

$$
\delta = R_{observé} - R_{attendu}
$$

- `δ < -0.25` → LTD + augmentation plasticité + recherche de mutation
- `δ > +0.25` → investigate useful transition
- `|δ| > surpriseThreshold` → surprise procédurale

La mutation n'est plus déclenchée artificiellement après N runs. Elle est déclenchée par **surprise procédurale**.

**Service :** `proceduralPredictionErrorService.js`

| Fonction | Rôle |
|---|---|
| `predictionContext(input)` | Structure le contexte de prédiction |
| `computePredictionError(ctx)` | Calcule δ |
| `peAction(pe, policy)` | Décide l'action à partir de δ |
| `expectedRewardFrom(synapse, ...)` | Calcule R_attendu |

---

### 5.9 Points 9-10 — Fitness multi-objectif + Plasticité homéostatique

**Concept biologique.** Le cerveau fonctionne avec de fortes contraintes énergétiques et homéostatiques.

**Invariant computationnel.**

Fitness :

$$
F = w_1 \cdot success + w_2 \cdot robustness + w_3 \cdot evidence + w_4 \cdot generalization - w_5 \cdot cost - w_6 \cdot risk - w_7 \cdot complexity
$$

Coût énergétique :

$$
C(G) = \alpha|V| + \beta|E| + \gamma \cdot tokenCost + \delta \cdot executionCost
$$

Plasticité homéostatique :

$$
w'_{AB} = w_{AB} \cdot \frac{targetActivity}{observedActivity}
$$

Empêche une seule procédure de devenir irréversiblement dominante (exploration préservée).

**Services :** `proceduralFitnessService.js`, `proceduralHomeostaticPlasticityService.js`

---

### 5.10 Points 11-12 — Épigénétique + Méthylation

**Concept biologique.** Une procédure peut être correcte dans un environnement et dangereuse dans un autre. Au lieu de modifier la procédure, on modifie son **expression**.

**Invariant computationnel.** Même génome, phénotype exprégré différent selon l'environnement.

```text
Genome
   ↓
epigenetic state
   ↓
expressed procedural phenotype
```

**Exemple :**

```yaml
procedure:
  deploy_without_human_confirmation
epigenetic_marks:
  development:
    expression: enabled
  staging:
    expression: conditional
  production:
    expression: silenced
```

**Méthylation :** une marque répressive cible une arête/procédure avec un déclencheur environnemental. L'arête existe mais `expression ≈ 0`.

**Services :** `proceduralEpigeneticService.js`, `proceduralMethylationService.js`

---

### 5.11 Points 13-14 — Immunité innée + adaptative

**Concept biologique.** Le système immunitaire inspecte les mutations et mémorise les signatures rejetées.

**Invariant computationnel.**

```text
mutation
   ↓
innate immune inspection
   ↓
sandbox
   ↓
challenge
   ↓
adaptive immune memory
   ↓
promotion
```

L'immunité innée détecte : bypass de politique, suppression de vérification, élévation de permissions, accès hors lease, réduction de preuves, contournement sandbox.

L'immunité adaptative transforme les mutations rejetées en **signatures** pour un rejet rapide des mutations similaires.

**Services :** `proceduralImmuneInspectionService.js`, `proceduralAdaptiveImmuneMemoryService.js`

---

### 5.12 Points 15-18 — Sélection naturelle + Écologie

**Concept biologique.** La mutation procédurale devient évolutionnaire, mais pas de darwinisme naïf.

**Invariant computationnel.**

```text
PG17
  ├─ mutation A
  ├─ mutation B
  ├─ mutation C
  └─ mutation D
      ↓
  fitness evaluation (environnementale)
      ↓
  survivors selected
```

Plusieurs lignées peuvent coexister si elles occupent des **niches procédurales différentes** :

- PG-A → petits repos Python
- PG-B → monorepos
- PG-C → code legacy sans tests

Le biome gère des populations par niche. L'environnement détermine fitness, resource allocation, replication, dormancy, extinction.

**Services :** `proceduralMutationSelectionService.js`, `proceduralEcologicalDiversityService.js`, `proceduralBiomePopulationService.js`, `proceduralEcologicalNicheService.js`

---

### 5.13 Points 19-21 — Holobionte + Rhizome + Métapopulation

**Concept biologique.** Une procédure complexe est un **holobionte** (hôte + symbiontes), pas un graphe monolithique.

**Invariant computationnel.**

```text
host debugging PG
      │
      ├── calls security symbiont
      ├── calls test symbiont
      └── calls memory symbiont
```

**Rhizome :** les fragments utiles se propagent sans autorité centrale, après validation locale.

**Métapopulation :** plusieurs populations conservent des familles de procédures différentes. Si A collapse, B et C permettent la **recolonisation**.

**Services :** `proceduralHolobionteService.js`, `proceduralRhizomePropagationService.js`, `proceduralMetapopulationService.js`

---

### 5.14 Points 22-24 — Apoptose + Cryptobiose + Fossilisation

**Concept biologique.** Certaines procédures doivent mourir, d'autres peuvent dormir.

**Invariant computationnel.**

**Apoptose :** déclenchée par `fitness < τ ∧ risk > ρ ∧ recoveryAttempts > N`. Avant la mort : **autopsie** qui extrait cause, environnement, mutations, descendants. Puis **fossilisation**.

**Cryptobiose :** procédures inutiles temporairement entrent en veille quasi-zéro, réactivables si la niche revient.

**Fossilisation :** archive complète (genotype, phenotype, niche, mutations, fitness history, causal evidence, failure cause, descendants) permettant de reconstruire la **phylogénie procédurale**.

```text
PG1
 ├── PG3
 │    └── PG9
 │         └── PG17 †
 └── PG4
      └── PG11
```

**Services :** `proceduralApoptosisService.js`, `proceduralCryptobiosisService.js`, `proceduralFossilizationService.js`

---

## 6. Invariants clés

Chaque mécanisme biologique doit correspondre à un invariant informatique mesurable. Sinon, le vocabulaire reste décoratif.

| Mécanisme | Invariant mesurable |
|---|---|
| LTP/LTD | poids + compteurs + taux de succès observables |
| Pruning | état explicite dans la base, pas suppression immédiate |
| Inhibition | type d'arête `inhibitory`, condition exprimable, force mesurable |
| Homéostasie | coût total `C(G)` et fitness multi-objectif réels |
| Épigénétique | même genome, phénotype exprimé différent selon environnement |
| Immunité | mutations rejetées mémorisées comme signatures, pas juste un log |
| Niches | fitness calculée dans un environnement délimité, pas globalement |
| Apoptose / fossilisation | mort explicite, autopsie, archive reconstituable |

---

## 7. Tests

Les tests sont dans 3 fichiers dédiés :

- `backend/tests/test_procedural_organism_foundations.js` — Points 1-8 (genome, synapse, plasticity, consolidation, pruning, inhibition, action selection, prediction error)
- `backend/tests/test_procedural_organism_9_12.js` — Points 9-12 (fitness, homeostatic plasticity, epigenetic, methylation)
- `backend/tests/test_procedural_organism_13_24.js` — Points 13-24 (immune, mutation, ecology, holobionte, rhizome, metapopulation, apoptosis, cryptobiosis, fossilization)

```bash
node backend/tests/test_procedural_organism_foundations.js
node backend/tests/test_procedural_organism_9_12.js
node backend/tests/test_procedural_organism_13_24.js
```

---

## 8. Références croisées

- **Philosophie :** `docs/08-philosophie.md` — section 27 (Organisme procédural)
- **Neurobiologie et plasticité :** `docs/01-concepts/neurobiologie-et-plasticite.md` — STDP, élagage, cycles de sommeil
- **Instinct :** `docs/01-concepts/instinct.md` — comportements innés vs apprentissage
- **Fossilisation :** `docs/01-concepts/fossilisation.md` — archive stratigraphique
- **Mémoire et apprentissage :** `docs/01-concepts/memoire-et-apprentissage.md` — consolidation, oubli, pruning
- **Épigénétique :** `docs/01-concepts/genome-et-epigenetique.md` — chromatine, méthylation
- **Biomimétisme :** `docs/01-concepts/biomimicry-handlers.md` — epigeneticMethylation handler
- **Épistémologie :** `docs/01-concepts/epistemologie-et-evidence.md` — preuve, gates, promotion
- **ADN agentique :** `docs/01-concepts/agent-dna-runtime.md` — génome, phénotype, expression
- **Topologies :** `docs/02-orchestration/topologies/` — biome, holobionte, rhizome, métapopulation
