# Natural Creative Ecology — Créativité Artificielle Multi-Échelle

- **Statut** : Implémenté — 11 services backend couvrant 6 moteurs de création de nouveauté, intégrés dans l'orchestrateur natif (`genos-orchestrate.cjs`). Tests d'ablation en cours de validation.
- **Portée** : `backend/src/services/{curiosity,representationalMutation,exaptation,play,affordanceMemory,phenotypeDevelopment,environmentGenerator,culturalTransmission,culturalSelection}Service.js`, `backend/src/services/nceIntegrationService.js`, `backend/bin/genos-orchestrate.cjs`, `backend/tests/nceAblation*.test.js`, `docs/08-philosophie.md` (section 28).
- **Dernière revue** : 2026-09-21.

---

## 1. Définition du domaine

La **Natural Creative Ecology** (NCE) est, dans GenOS, un **système de création de nouveauté multi-échelle** dont l'hypothèse fondamentale est que la créativité artificielle émerge de l'interaction de plusieurs mécanismes naturels complémentaires, plutôt que d'un unique algorithme d'optimisation.

Contrairement aux systèmes spécialisés (AlphaEvolve pour l'évolution, POET pour la coévolution environnement-agent, Voyager pour l'accumulation de compétences), NCE ne suppose pas de source unique de créativité. Elle postule que **la nature n'est pas un oracle de solutions, mais une immense bibliothèque de mécanismes de recherche, d'adaptation, de conservation et d'émergence**.

### Hypothèse de recherche

> *Quels invariants des systèmes naturels améliorent réellement les agents artificiels ?*

> *La combinaison imagination + exploration + plasticité + auto-organisation + évolution + culture peut-elle produire une créativité plus ouverte que les approches artificielles spécialisées actuelles ?*

### Les six niveaux naturels

| Niveau | Ce que fait la nature | Ce que GenOS devrait en extraire |
|--------|----------------------|----------------------------------|
| **Humain** | Imagine l'absent, recombine des souvenirs, change de représentation | Espace de possibilités, représentations alternatives, exaptation |
| **Animal** | Explore réellement, joue sans objectif, mesure le progrès | Découverte de possibilités, affordances, curiosité basée sur l'apprentissage |
| **Végétal** | Change sa propre forme, atrophie les branches inutilisées | Adaptation de la machine qui cherche, phénotype dynamique |
| **Matière** | S'auto-organise sans planificateur global | Structure spontanée, stigmergie, gradients |
| **Évolution** | Conserve et transforme par mutations, sélection, migration | Accumulation transgénérationnelle, novelty archive, multi-îlots |
| **Culture** | Transmet et réinterprète en quelques minutes | Accumulation inter-agent accélérée, traditions, sélection culturelle |

---

## 2. Éléments préexistants dans GenOS

Avant NCE, GenOS possédait déjà plusieurs briques :

### Moteur créatif Rust (`crates/genos-creativity/`)

```text
DreamingPhase
    │
    ▼
SalienceGate
    │
    ▼
Executive
    │
    ▼
DopamineSignal
    │
    ▼
CrossConsolidation
```

- **Dreaming** : génération d'hypothèses, recombinaison de fragments, simulation mentale
- **Salience** : filtrage par nouveauté, pertinence, faisabilité
- **Executive** : exécution des tâches focalisées
- **Dopamine** : reward prediction error (RPE)
- **Consolidation** : plasticité et mémoire à long terme

Métriques : `dreams_generated`, `unique_concepts_generated`, `recombined_hypotheses`, `prediction_error`, `validated_hypotheses`, `novel_concepts_promoted`

### Drives endogènes (`crates/genos-orchestrator/drives.rs`)

```rust
energy
integrity
curiosity
survival
```

Peut choisir `Goal::Explore` sans mission externe.

### Évolution multi-îlots (`crates/genos-orchestrator/evolution.rs`)

```text
Population
Individual
Island
mutation
crossover
fitness
novelty archive
lineage
migration
quality proof
```

### Stratégies (`strategies.md`)

```text
genetic_strategy_algorithm
niche_exploration
controlled_lamarckian_learning
evidence_based_breeding
plasmid_divergent_optimization
```

### Limites de l'existant

| Limite | Conséquence |
|--------|-------------|
| Nouveauté = `1/(1+Occurrences(c))` | Pas de nouveauté conceptuelle |
| Curiosity = `low stress + not observed` | Pas de mesure du progrès d'apprentissage |
| Payload = placeholder structuré | Pas de monde imaginaire riche |
| Pas d'exaptation | Pas de réinvestissement de capacités |
| Pas de transmission culturelle | Pas d'accélération inter-agent |
| Pas de plasticité phénotypique | Agents statiques |
| Pas de coévolution environnement | Pas de POET-like |

---

## 3. Les 18 mécanismes NCE et leur ancrage GenOS

| # | Mécanisme biologique | Invariant computationnel | Service |
|---|----------------------|--------------------------|---------|
| 1 | **Imagination contrefactuelle** (DMN, hippocampe) | Manipulation de choses qui n'existent pas encore, recombinaison de fragments | `representationalMutationEngine` |
| 2 | **Changement de représentation** | `PR₁ → PR₂` comme opération de première classe | `representationalMutationEngine` |
| 3 | **Exaptation** (Jacob, Kassen) | Capacité créée pour A peut résoudre B | `exaptationEngine` |
| 4 | **Recombinaison associative distante** | `score(A,B) = distance × compatibilité × potentiel` | `representationalMutationEngine` |
| 5 | **Curiosité basée sur le progrès** (Ten et al.) | `C = wₙN + wᵢIG + wₗLP + wₐA - w_cC - w_rR` | `curiosityService` |
| 6 | **Robustesse noisy-TV** (Jarrett et al.) | Réduire A si LP=0 | `curiosityService` |
| 7 | **PlaySandbox** | Budget limité, sandbox obligatoire, rollback | `playService` |
| 8 | **AffordanceMemory** | Mémoriser les capacités découvertes | `affordanceMemoryService` |
| 9 | **Plasticité phénotypique** | `Structure(agent) = f(genome, env, history)` | `phenotypeDevelopmentService` |
| 10 | **Coévolution env/agent** (POET) | Génération simultanée d'environnements | `environmentGeneratorService` |
| 11 | **Coévolution env/agent/rep** | `Env ↔ Agent ↔ PR` | `environmentGeneratorService` + `representationalMutationEngine` |
| 12 | **Stepping stones** | Préserver les "échecs prometteurs" | `cryptobiosisSporeService` + `fossilizationService` |
| 13 | **Transmission culturelle intentionnelle** | Imitation, démonstration, enseignement | `culturalTransmissionService` |
| 14 | **Sélection culturelle** | Utilité, preuve, prestige, fiabilité | `culturalSelectionService` |
| 15 | **Traditions et lignées** | Artefacts avec variants, lignée | `culturalTransmissionService` + `culturalSelectionService` |
| 16 | **Novelty creates affordances** | `OEV(x) = N(x) × FP(x)` | Principe transversal |
| 17 | **Tests d'ablation** | BASELINE → +moteurs → FULL | `nce_ablation_tests.js` |
| 18 | **Intégration orchestrateur** | `enhanceMissionWithNCE()` modifie le prompt | `nceIntegrationService` + `genos-orchestrate.cjs` |

---

## 4. Modèle mathématique

### Curiosité multi-signal

```
Curiosity(x) = wₙ·N(x) + wᵢ·IG(x) + wₗ·LP(x) + wₐ·A(x) - w_c·Cost(x) - w_r·Risk(x)
```

- **N(x)** = nouveauté : `1/(1 + occurrences(x))`
- **IG(x)** = expected information gain : `variance × familiarity`
- **LP(x)** = learning progress : `Δerreur / erreur_initiale × (1 - mastery)`
- **A(x)** = affordance uncertainty : `1 - tested_ratio` (réduit si LP=0)
- **Cost(x)** = coût estimé
- **Risk(x)** = risque estimé

Contraintes : `wₗ > wₙ, wᵢ` (le progrès domine), `A(x) *= 0.15` si `LP < 0.01`

### Recombinaison associative distante

```
Parents = argmax( distance(A,B) × compatibilité(A,B) × potentiel(A,B) )
```

### Open-ended value

```
OpenEndedValue(x) = Novelty(x) × FuturePossibilités(x)
```

### Phénotype dynamique

```
Structure(agent) = f(genome, environment, history)

growBranch(type)    → renforce la branche
atrophyBranch(id)   → atrophie si inutilisé
useBranch(id)       → incrémente useCount, renforce
```

### Score culturel

```
selection_score = Σ (criterium_i × weight_i)

criteria: usefulness, evidence, prestige, reliability, contextual_fit
```

---

## 5. Boucle de créativité NCE

```text
                         WORLD
                           │
                     perturbation
                           ▼
                ┌────────────────────┐
                │ SELF-ORGANIZATION  │ ← MATTER (Biome, stigmergie)
                └─────────┬──────────┘
                          │
                          ▼
                ┌────────────────────┐
                │    PLASTICITY      │ ← PLANTS (phénotype dynamique)
                └─────────┬──────────┘
                          │
                          ▼
                ┌────────────────────┐
                │    EXPLORATION     │ ← ANIMALS (curiosité, jeu)
                │  curiosity, play   │
                └─────────┬──────────┘
                          │
                     observations
                          ▼
                ┌────────────────────┐
                │    IMAGINATION     │ ← HUMANS (représentation, exaptation)
                │ counterfactuals,   │
                │ reframing, remote  │
                │ association        │
                └─────────┬──────────┘
                          │
                       ideas
                          ▼
                   EXPERIMENTATION
                          │
                    evidence gate
                          ▼
               ┌─────────────────────┐
               │     EVOLUTION       │
               │ preserve / mutate   │
               │ exapt / speciate    │
               └─────────┬───────────┘
                         │
                         ▼
               ┌─────────────────────┐
               │       CULTURE       │
               │ teach / imitate     │
               │ modify / transmit   │
               └─────────┬───────────┘
                         │
                  new capabilities
                         │
                         └──────────────► WORLD
```

---

## 6. Humain → Imagination

### Imagination contrefactuelle

Une idée ne doit plus être seulement `Concept::Mutate + fragments parents`. Elle devrait pouvoir constituer un **monde imaginaire** :

```text
HypothesisWorld
├── assumptions
├── entities
├── causal_relations
├── representation
├── expected_events
├── impossible_or_unknown_parts
├── provenance
└── predicted_observations
```

### Recombinaison associative distante

```text
Semantic Memory Graph

A ── proche ── B
│
│ énorme distance
│
▼
Z

score(A,B) = distance(A,B) × compatibilité(A,B) × potentiel(A,B)
```

### Changement de représentation

```text
"allocation de tâches"
    → problème de marché
    → écosystème de niches
    → champ de gradients
    → problème de diffusion
```

### Exaptation

```text
Capability X was created for A.
Could X solve B?
Could a fragment of X solve C?
Could X + Y create Z?
Could X become a tool instead of a strategy?
Could X operate at another scale?
```

---

## 7. Animal → Exploration

### Curiosité basée sur le progrès d'apprentissage

Inspiré par PMC8514490 (Ten et al., 2021) : les humains suivent le progrès d'apprentissage, pas juste la surprise.

Avantages :
- Évite de s'acharner sur des problèmes impossibles
- Évite les problèmes déjà maîtrisés
- Évite le piège "noisy TV" (Jarrett et al., 2022)

### PlaySandbox

```text
PLAY
├── aucune mission utilisateur nécessaire
├── sandbox obligatoire
├── petit budget
├── rollback automatique
└── essayer : outil A sur objet B, combinaison X+Y, stratégie jamais utilisée
```

### AffordanceMemory

Mémorise les capacités découvertes :
- capability, verb, target
- confidence, utility, use_count, success_count
- first_seen, last_seen

---

## 8. Végétal → Plasticité

### Structure(agent) = f(genome, environment, history)

```text
AgentDNA
    │
    ▼
Minimal phenotype
    │
    ├── environment requires retrieval
    │        ↓
    │   retrieval branch grows
    │
    ├── environment requires proof
    │        ↓
    │   verifier tissue grows
    │
    └── branch unused
             ↓
          atrophy
```

### Phénotype dynamique

- **growBranch(type)** : crée une spécialisation
- **atrophyBranch(id)** : atrophie si inutilisé > seuil
- **reactivateBranch(id)** : réactive si contexte change
- **useBranch(id)** : renforce l'utilisation

---

## 9. Matière → Auto-organisation

### Objectif

```text
ordre global peut apparaître sans planificateur global
```

### Mécanismes

- Gradients de ressources
- Stigmergie (dépôt de traces)
- Diffusion
- Décroissance locale
- Activation/inhibition locale

### Comparaison expérimentale

```text
A — supervisor allocation (centralisé)
B — market allocation (décentralisé)
C — stigmergic allocation (champ de traces)
D — reaction-diffusion-like (gradients)
E — hybrid
```

---

## 10. Évolution → Accumulation

### Multi-îlots existants

```text
Population, Individual, Island
mutation, crossover, fitness
novelty archive, lineage, migration
quality proof
```

### Améliorations nécessaires

Distinguer :
- **genotypic novelty**
- **phenotypic novelty**
- **behavioral novelty**
- **semantic novelty**
- **functional novelty**
- **ecological novelty**

### Exaptation évolutive

Les structures existantes sont réinvesties dans de nouveaux contextes.

---

## 11. Culture → Transmission

### 5 modes de transmission

| Mode | Fidélité | Coût | Description |
|------|----------|------|-------------|
| imitation | 0.6 | 0.1 | L'agent observe et copie |
| demonstration | 0.8 | 0.3 | L'agent montre explicitement |
| teaching | 0.9 | 0.5 | L'agent explique et guide |
| apprenticeship | 0.95 | 0.7 | Apprentissage supervisé |
| artifact_use | 0.5 | 0.05 | Utilisation d'artefacts |

### Sélection culturelle

```text
GENETIC    what I inherit
EPIGENETIC how my inherited machinery is expressed
INDIVIDUAL what I discover
CULTURAL   what others taught/transmitted to me
```

### Traditions

```text
CulturalLayer
├── practices/     strategies, procedures, heuristics
├── artifacts/     tools, code, abstractions
├── transmission/  imitation, demonstration, teaching
├── traditions/    lineage, variants, provenance
├── selection/     usefulness, evidence, prestige, reliability
└── innovation/    mutation, reinterpretation, combination
```

---

## 12. Tests d'ablation

### Protocole

```
BASELINE → +curiosity → +exploration → +plasticity → +selfOrg → +evolution → +culture → FULL NCE
```

### Plan factoriel

Avec 6 couches, un plan factoriel complet donne `2⁶ = 64` configurations.

Permet de découvrir :
- Culture seule inutile
- Culture × Evolution très bénéfique
- Interactions non-linéaires

### Métriques

| Métrique | Description |
|----------|-------------|
| Δ performance | Taux de succès |
| Δ novelty | Distance par rapport aux solutions existantes |
| Δ diversity | Nombre de solutions uniques |
| Δ transfert | Capacité à résoudre des problèmes nouveaux |
| Δ coût | Tokens/étapes nécessaires |
| Δ discoveries | Nombre de stepping stonesouverts |

---

## 13. Distinction par rapport aux systèmes existants

| Système | Mécanisme dominant | Version NCE |
|---------|-------------------|-------------|
| **AlphaEvolve** | évolution + évaluateur auto | évolution sous preuve + niches + exaptation |
| **Darwin Gödel Machine** | archive d'agents auto-modifiants | AgentDNA + lignées + forks + phénotypes + gates |
| **POET** | coévolution env/agent | coévolution env/agent/representation |
| **Voyager** | curriculum auto + skills | curiosité animale + culture cumulative |
| **AI Co-Scientist** | société d'hypothèses | topologies + imagination + épistémologie + falsification |
| **Quality-Diversity** | solutions diverses + performantes | écosystème de niches multi-échelles |

### Ce que NCE n'est PAS

NCE ne reproduit pas les architectures des systèmes ci-dessus. Il fournit le **substrat naturel commun** qui rend leurs comportements possibles — et les étend.

### Créativité comme émergence

```
Creativity = Emergence(
    imagination,
    exploration,
    plasticity,
    selfOrganization,
    evolution,
    culture
)
```

---

## 14. Intégration dans l'orchestrateur

### Point d'entrée

```javascript
const nceIntegration = require('../src/services/nceIntegrationService');
const nceEnhancements = await nceIntegration.enhanceMissionWithNCE(mission, db);
```

### Ce qui est modifié

| Élément | Modification |
|---------|--------------|
| `prompt` | Enrichi avec représentations, exaptations, curiosités |
| `current_task` | Mis à jour avec enhancedPrompt |
| `metadata_json` | Stocke nceMetadata |
| `strategyContract` | Non modifié (preuve requise) |
| `tool leases` | Non modifiés (nécessite phénotype) |
| `workers` | Non modifiés (nécessite topologie) |
| `topology` | Non modifiée (nécessite auto-organisation) |

### Garanties

- **Non-blocant** : si un moteur échoue, la mission continue
- **Optionnel** : activable via `request.nceOptions`
- **Rapporté** : JSON de sortie inclut `nce.enhancementsApplied`, etc.

---

## 15. Limites honnêtes

1. **Pas de créativité générale** : les moteurs optimisent des métriques locales sans compréhension sémantique profonde
2. **Pas de conscience** : la "simulation mentale" est un calcul de faisabilité sur des structures JSON
3. **Bruit stochastique** : la recombinaison associative repose sur une distance textuelle simple
4. **Pas d'open-endedness prouvée** : la génération automatique de questions reste à développer
5. **Coût computationnel** : l'évaluation de 6 moteurs augmente la latence
6. **Pas de créativity score unique** : le modèle produit un vecteur de phénotype créatif, pas un scalaire
7. **Documentation en avance sur le runtime** : certaines fonctions documentées ne sont pas implémentées

---

## 16. Invariant clé

Chaque mécanisme biologique doit correspondre à **un invariant computationnel mesurable**. Sinon, le vocabulaire reste décoratif.

| Mécanisme | Invariant mesurable |
|-----------|---------------------|
| Curiosité | `computeCuriosity(domain) ∈ [0,1]` avec `LP > 0.01` requis |
| Recombinaison | `score(A,B) = distance × compatibilité × potentiel` |
| Exaptation | `proposal_score = (alignment + novelty + feasibility) / 3` |
| Plasticité | `branches.length`, `avgStrength`, `history.length` |
| Culture | `efficiency = fidelity × quality × (1 + skillGap)` |
| Environnement | `overallScore = capabilityScore × difficultyFactor` |

---

## 17. Références

- Ten et al., *Humans monitor learning progress in curiosity-driven exploration* (PMC8514490, 2021)
- Jarrett et al., *Curiosity in Hindsight: Intrinsic Exploration in Stochastic Environments* (arXiv:2211.10515, 2022)
- Wu et al., *A Systematic Review of Creativity-Related Studies Applying the Remote Associates Test* (PMC7644781, 2020)
- Beaty et al., *Network Neuroscience of Creative Cognition* (PMC6428436, 2018)
- Kassen, *Experimental evolution of innovation novelty* (PMC6642843, 2019)
- Colizzi et al., *Modelling the evolution of novelty* (PMC9750852, 2022)
- Wang et al., *POET: Endlessly Generating Increasingly Complex Environments* (arXiv:1901.01753, 2019)
- Wang et al., *Voyager: An Open-Ended Embodied Agent* (arXiv:2305.16291, 2023)
- Qian et al., *Quality-Diversity Algorithms Can Provably Be Helpful for Optimization* (arXiv:2401.10539, 2024)
- Morgan et al., *Human culture is uniquely open-ended rather than uniquely cumulative* (Nature Human Behaviour, 2024)
- Mackintosh et al., *Intentional transmission of knowledge optimises cumulative cultural evolution* (Nature Scientific Reports, 2026)
- Schneider et al., *Plant Phenotypic Plasticity: From Molecular Mechanisms to Breeding* (Annual Reviews, 2026)
- Mehra et al., *Root Growth and Development in "Real Life"* (Annual Reviews, 2025)
- Brinkmann et al., *Machine culture* (Nature Human Behaviour, 2023)
- Singh et al., *Non-equilibrium self-assembly for living matter-like properties* (Nature Reviews Chemistry, 2024)

---

## 18. Historique des commits

| Commit | Moteur(s) |
|--------|-----------|
| `a4b03342` | Curiosité (learning progress) |
| `a632625b` | RepresentationalMutation + Exaptation |
| `1323331b` | PlaySandbox + AffordanceMemory |
| `eef99693` | Développement phénotypique |
| `5219faaf` | Génération d'environnements co-évolutifs |
| `cc9d151f` | Transmission + sélection culturelle |
| `9b66cab4` | Intégration orchestrateur natif |
| `c712087f` | Tests d'ablation scientifiques |
| `76c6ab4a` | Documentation section 28 |
