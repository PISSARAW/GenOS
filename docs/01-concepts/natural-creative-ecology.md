# Natural Creative Ecology (NCE)

- **Statut** : Implémenté — 11 services backend couvrant 6 moteurs de création de nouveauté, intégrés dans l'orchestrateur natif (`genos-orchestrate.cjs`).
- **Portée** : `backend/src/services/{curiosity,representationalMutation,exaptation,play,affordanceMemory,phenotypicDevelopment,environmentGenerator,culturalTransmission,culturalSelection}Service.js`, `backend/src/services/nceIntegrationService.js`, `backend/bin/genos-orchestrate.cjs`, `docs/08-philosophie.md` (section 28).
- **Dernière revue** : 2026-09-21.

## 1. Définition du domaine

La **Natural Creative Ecology** (NCE) est, dans GenOS, un **système de création de nouveauté multi-échelle** dont l'hypothèse fondamentale est que la créativité artificielle émerge de l'interaction de plusieurs mécanismes naturels complémentaires, plutôt que d'un unique algorithme d'optimisation.

Contrairement aux systèmes spécialisés (AlphaEvolve pour l'évolution, POET pour la coévolution environnement-agent, Voyager pour l'accumulation de compétences), NCE ne suppose pas de source unique de créativité. Elle postule que **la nature n'est pas un oracle de solutions, mais une immense bibliothèque de mécanismes de recherche, d'adaptation, de conservation et d'émergence**.

### Hypothèse de recherche

> *Quels invariants des systèmes naturels améliorent réellement les agents artificiels ?*

> *La combinaison imagination + exploration + plasticité + auto-organisation + évolution + culture peut-elle produire une créativité plus ouverte que les approches artificielles spécialisées actuelles ?*

### Les six niveaux naturels

| Niveau | Ce que fait la nature | Ce que GenOS en extrait | Service |
| --- | --- | --- | --- |
| **Humain** | Imagine l'absent, recombine des souvenits, change de représentation | Espace de possibilités, représentations alternatives, exaptation | `representationalMutationEngine.js`, `exaptationEngine.js` |
| **Animal** | Explore réellement, joue sans objectif, mesure le progrès | Découverte de possibilités, affordances, curiosité basée sur l'apprentissage | `curiosityService.js`, `playService.js`, `affordanceMemoryService.js` |
| **Végétal** | Change sa propre forme, atrophie les branches inutilisées | Adaptation de la machine qui cherche, phénotype dynamique | `phenotypicDevelopmentService.js` |
| **Matière** | S'auto-organise sans planificateur global | Structure spontanée, stigmergie, gradients | `biomeCoordinationService.js` (existant) |
| **Évolution** | Conserve et transforme par mutations, sélection, migration | Accumulation transgénérationnelle, novelty archive, multi-îlots | `agentEvolutionService.js` (existant) |
| **Culture** | Transmet et réinterprète en quelques minutes | Accumulation inter-agent accélérée, traditions, sélection culturelle | `culturalTransmissionService.js`, `culturalSelectionService.js` |

---

## 2. Les 18 mécanismes et leur ancrage GenOS

| # | Mécanisme biologique | Invariant computationnel | Service NCE |
| --- | --- | --- | --- |
| 1 | **Imagination contrefactuelle** (DMN, hipppocampe) | Manipulation de choses qui n'existent pas encore, recombinaison de fragments, simulation mentale | `representationalMutationEngine.js` (représentations alternatives, recombinaison associative distante) |
| 2 | **Changement de représentation** | `ProblemRepresentation₁ → ProblemRepresentation₂` comme opération de première classe | `representationalMutationEngine.js` (6 types : hybrid, market, ecosystem, gradient, diffusion, stigmergic) |
| 3 | **Exaptation** (Jacob, Kassen) | Une capacité créée pour A peut résoudre B, devenir un outil, opérer à une autre échelle | `exaptationEngine.js` (6 patterns : full_reuse, fragment_reuse, combination, role_shift, scale_shift, abstraction_extraction) |
| 4 | **Remote associative recombination** | `score(A,B) = distance(A,B) × compatibilité(A,B) × potentiel(A,B)` | `representationalMutationEngine.js` (sélection de parents distants dans le graphe sémantique) |
| 5 | **Curiosité basée sur le progrès** (Ten et al., PMC8514490) | `Curiosity(x) = wₙN(x) + wᵢIG(x) + wₗLP(x) + wₐA(x) − w_cCost(x) − w_rRisk(x)` | `curiosityService.js` (novelty, information gain, learning progress, affordance uncertainty) |
| 6 | **Noisy-TV robustness** (Jarrett et al., arXiv:2211.10515) | L'incertitude d'affordance est réduite à 15% si LP=0 (évite les stimuli imprévisibles mais non apprenants) | `curiosityService.js` (modulation de A par LP) |
| 7 | **PlaySandbox** (exploration sans objectif) | Budget limité, sandbox obligatoire, rollback automatique, aucune mission externe requise | `playService.js` (session de jeu, itérations, contraintes sécurité) |
| 8 | **AffordanceMemory** | Les capacités découvertes sont mémorisées avec confiance, utilité, comptes de succès/échec | `affordanceMemoryService.js` (store, recordSuccess, recordFailure, findUnknownContexts) |
| 9 | **Plasticité phénotypique** (Annual Reviews 2026) | `Structure(agent) = f(genome, environment, history)` — branches qui poussent vers les ressources | `phenotypicDevelopmentService.js` (growBranch, atrophyBranch, reactivateBranch, developFromEnvironment) |
| 10 | **Coévolution environnement/agent** (POET, arXiv:1901.01753) | Génération simultanée d'environnements de complexité croissante, transfert de solutions | `environmentGeneratorService.js` (mutateEnvironment, coevolveGeneration, generateCurriculum) |
| 11 | **Coévolution env/agent/representation** | `Environment ↔ Agent ↔ ProblemRepresentation` (extension POET à 3 objets) | `environmentGeneratorService.js` + `representationalMutationEngine.js` |
| 12 | **Stepping stones** | Les "échecs prometteurs" sont préservés (cryptobiose, fossil, dormant) plutôt que détruits | `cryptobiosisSporeService.js` (existant) + `fossilizationService.js` (existant) |
| 13 | **Transmission culturelle intentionnelle** (Nature Sci Rep 2026) | Imitation, démonstration, enseignement, apprentissage, utilisation d'artefacts | `culturalTransmissionService.js` (5 modes, fidélité 0.5-0.95) |
| 14 | **Sélection culturelle** | Évaluation selon utilité, preuve, prestige, fiabilité, adéquation contextuelle | `culturalSelectionService.js` (evaluateCulturalTrait, selectCulturalTraits, pruneObsoleteTraits) |
| 15 | **Traditions et lignées** | Artefacts culturels avec variants, lignée de provenance, innovation par mutation | `culturalTransmissionService.js` (createCulturalArtifact, mutateArtifact, createTradition) |
| 16 | **Novelty must create affordances** | `OpenEndedValue(x) = Novelty(x) × FuturePossibilities(x)` — une découverte moyenne qui ouvre 20 autres est plus précieuse qu'une découverte spectaculaire mais terminale | Principe transversal à tous les moteurs |
| 17 | **Tests d'ablation scientifiques** | `BASELINE → +curiosity → +exploration → +plasticity → +selfOrg → +evolution → +culture → FULL NCE` avec mêmes modèles, mêmes budgets, mêmes problèmes | `nce_ablation_tests.js` (matrice d'ablation, métriques performance/nouveauté/diversité/transfert) |
| 18 | **Intégration orchestrateur natif** | `enhanceMissionWithNCE()` injecte les améliorations avant la création de l'agent — non-blocant, optionnel, rapporté dans la télémétrie | `nceIntegrationService.js` + `genos-orchestrate.cjs` |

---

## 3. La boucle de créativité

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
                │    EXPLORATION     │ ← ANIMAL (curiosité, jeu)
                └─────────┬──────────┘
                          │
                     observations
                          ▼
                ┌────────────────────┐
                │    IMAGINATION     │ ← HUMAIN (représentation, exaptation)
                │ counterfactuals    │
                │ reframing          │
                │ remote association │
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

Il manque une flèche essentielle pour l'open-endedness :

```text
WORLD
  ↓
GenOS creates a new question
  ↓
GenOS creates a new environment
  ↓
new WORLD
```

Cette flèche est partiellement couverte par `environmentGeneratorService.js` (génération de curriculum, mutation d'environnements) mais l'auto-génération de **questions** reste à développer.

---

## 4. Principe fondamental : la nouveauté crée des affordances

Une découverte n'est véritablement intéressante que si elle ouvre de nouvelles possibilités :

```
OpenEndedValue(x) = Novelty(x) × FuturePossibilités(x)
```

Ce principe est **transversal** à tous les moteurs :
- **Curiosité** : un domaine est d'autant plus intéressant qu'il reste du potentiel d'apprentissage (`remainingPotential`)
- **Exaptation** : une capacité est d'autant plus précieuse qu'elle résout de *nouveaux* problèmes
- **Phénotype** : une branche est d'autant plus renforcée qu'elle est utilisée (`useBranch`)
- **Culturel** : un trait est d'autant plus sélectionné qu'il est utile dans de *nombreux* contextes (`contextualFit`)
- **Environnement** : un environnement est d'autant plus intéressant qu'il génère des **stepping stones**

---

## 5. Tests d'ablation

L'expérience déterminante compare :

```
BASELINE → +curiosity → +exploration → +plasticity → +selfOrg → +evolution → +culture → FULL NCE
```

avec à chaque étape les mêmes modèles, le même budget et les mêmes problèmes.

### Métriques mesurées

| Métrique | Description | Service de mesure |
| --- | --- | --- |
| Δ performance | Taux de succès pondéré par la qualité | `computePerformance()` |
| Δ novelty | Distance par rapport aux solutions existantes | `computeNovelty()` |
| Δ diversity | Nombre de solutions uniques générées | `computeDiversity()` |
| Δ transfert | Capacité à résoudre des problèmes nouveaux | `computeTransfer()` |
| Δ coût | Tokens/étapes nécessaires | `tokenUsage()` dans l'orchestrateur |
| Δ discoveries | Nombre de stepping stonesouverts | `findMostPromising()` dans `affordanceMemoryService.js` |

Voir `backend/tests/nce_ablation_tests.js`.

---

## 6. Distinction par rapport aux systèmes existants

| Système | Mécanisme dominant | Limite que NCE adresse |
| --- | --- | --- |
| **AlphaEvolve** | `Programs → Evaluation → Selection → Mutation → BetterPrograms` | Ne mute que les solutions, pas la représentation ni l'environnement |
| **POET** | `Environment ↔ Agent` | Ne co-évolue pas la représentation du problème |
| **Voyager** | Exploration + skill accumulation | Pas de plasticité phénotypique ni de sélection culturelle |
| **DGM** | Archive d'agents auto-modifiants | Pas de couche culturelle ni de coévolution environnement |
| **Co-Scientist** | Société d'hypothèses | Pas de plasticité phénotypique ni de jeu sandbox |
| **Quality-Diversity** | Solutions diverses + performantes | Pas de transmission culturelle ni de mutations d'environnement |

NCE ne reproduit pas leurs architectures. Il fournit le **substrat naturel commun** qui rend leurs comportements possibles — et les étend.

---

## 7. Intégration dans l'orchestrateur natif

Les 6 moteurs sont intégrés dans `backend/bin/genos-orchestrate.cjs` via `nceIntegrationService.js`.

### Point d'entrée

```javascript
const nceIntegration = require('../src/services/nceIntegrationService');
const nceEnhancements = await nceIntegration.enhanceMissionWithNCE(mission, db);
```

### Garanties

- **Non-blocant** : si un moteur échoue, la mission continue sans lui (télémétrie `NCE_SKIPPED`)
- **Optionnel** : activable via `request.nceOptions` dans le payload JSON
- **Rapporté** : le JSON de sortie inclut `nce.enhancementsApplied`, `nce.curiousDomains`, etc.

### Options configurables

```json
{
  "nce_options": {
    "curiosity": true,
    "curiosityWeights": { "novelty": 0.15, "informationGain": 0.15, "learningProgress": 0.4, "affordanceUncertainty": 0.15, "cost": 0.075, "risk": 0.075 },
    "reprMutation": true,
    "exaptation": true,
    "play": true,
    "playBudget": 5,
    "phenotype": true,
    "envCoev": true,
    "envPopulation": 8,
    "culture": true
  }
}
```

---

## 8. Limites honnêtes

1. **Pas de créativité générale** : les moteurs optimisent des métriques locales (curiosity score, exaptation score) sans compréhension sémantique profonde.
2. **Pas de conscience** : la "simulation mentale" est un calcul de faisabilité sur des structures JSON, pas une imagination phénoménologique.
3. **Bruit stochastique** : la recombinaison associative repose sur une distance textuelle simple (countOverlap), pas sur un véritable modèle sémantique.
4. **Pas d'open-endedness prouvée** : la génération automatique de questions reste à développer.
5. **Coût computationnel** : l'évaluation de 6 moteurs par mission augmente la latence — les tests d'ablation doivent démontrer que le surcoût est justifié par les gains.
6. **Pas de créativity score unique** : le modèle produit un vecteur de phénotype créatif `[N, Q, S, D, T, E, O, H]`, pas un score scalaire.

---

## 9. Invariant clé

Chaque mécanisme biologique doit correspondre à **un invariant computationnel mesurable**. Sinon, le vocabulaire reste décoratif.

| Mécanisme | Invariant mesurable |
| --- | --- |
| Curiosité | `computeCuriosity(domain) ∈ [0,1]` avec `LP > 0.01` requis pour explorer |
| Recombinaison | `score(A,B) = distance × compatibilité × potentiel` |
| Exaptation | `exaptation_score = (alignment + novelty + feasibility) / 3` |
| Plasticité | `branches.length`, `avgStrength`, `history.length` |
| Culture | `efficiency = fidelity × quality × (1 + skillGap)` |
| Environnement | `overallScore = capabilityScore × difficultyFactor` |

---

## 10. Références

- Ten et al., *Humans monitor learning progress in curiosity-driven exploration* (PMC8514490, 2021)
- Jarrett et al., *Curiosity in Hindsight: Intrinsic Exploration in Stochastic Environments* (arXiv:2211.10515, 2022)
- Wu et al., *A Systematic Review of Creativity-Related Studies Applying the Remote Associates Test* (PMC7644781, 2020)
- Beaty et al., *Network Neuroscience of Creative Cognition* (PMC6428436, 2018)
- Kassen, *Experimental evolution of innovation novelty* (PMC66428436, 2019)
- Colizzi et al., *Modelling the evolution of novelty* (PMC9750852, 2022)
- Wang et al., *POET: Endlessly Generating Increasingly Complex Environments* (arXiv:1901.01753, 2019)
- Wang et al., *Voyager: An Open-Ended Embodied Agent* (arXiv:2305.16291, 2023)
- Qian et al., *Quality-Diversity Algorithms Can Provably Be Helpful for Optimization* (arXiv:2401.10539, 2024)
- Morgan et al., *Human culture is uniquely open-ended rather than uniquely cumulative* (Nature Human Behaviour, 2024)
- Mackintosh et al., *Intentional transmission of knowledge optimises cumulative cultural evolution* (Nature Scientific Reports, 2026)
- Schneider et al., *Plant Phenotypic Plasticity: From Molecular Mechanisms to Breeding* (Annual Reviews, 2026)
- Mehra et al., *Root Growth and Development in "Real Life"* (Annual Reviews, 2025)
- Brinkmann et al., *Machine culture* (Nature Human Behaviour, 2023)

---

## 11. Historique des commits

| Commit | Moteur(s) |
| --- | --- |
| `a4b03342` | Curiosité (learning progress) |
| `a632625b` | RepresentationalMutation + Exaptation |
| `1323331b` | PlaySandbox + AffordanceMemory |
| `eef99693` | Développement phénotypique |
| `5219faaf` | Génération d'environnements co-évolutifs |
| `cc9d151f` | Transmission + sélection culturelle |
| `9b66cab4` | Intégration orchestrateur natif |
| `c712087f` | Tests d'ablation scientifiques |
| `76c6ab4a` | Documentation section 28 |
