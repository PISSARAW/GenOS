---
title: "Mathematical Organism — GenOS Mathématique"
description: "Écosystème de recherche mathématique formel — Natural Creative Ecology appliquée aux preuves"
version: 1.1.1
author: GenOS
created: 2026-09-21
tags: [mathematics, proofs, ecology, biomimicry, lean, sat, nce]
parent: natural-creative-ecology.md
---

# Mathematical Organism — Écosystème de Recherche Mathématique

## 1. Définition du domaine

Le **Mathematical Organism** est un prototype logiciel de recherche assistée en mathématiques, organisé autour de mécanismes inspirés de la **Natural Creative Ecology (NCE)**. Les noms biologiques désignent ici des politiques et des structures de données, pas des mécanismes biologiques. Leur présence dans le code ne démontre ni leur fidélité à un phénomène vivant ni leur avantage scientifique.

| Niveau | Source biologique | Comportement computationnel | Service |
|--------|------------------|----------------------------|---------|
| **Humain** | Imagination contrefactuelle | Représentations alternatives, exaptation de concepts | `goalEpitopeExtractor.js`, `mutationEngine.js` |
| **Animal** | Exploration/foraging | Marginal Value Theorem, stigmergie, migration entre niches | `literatureForager.js`, `mathematicalNichePopulationService.js` |
| **Végétal** | Plasticité phénotypique | Adaptation dynamique des stratégies de recherche | `proofStrategyRepertoire.js`, `mathematicalPopulation.js` |
| **Matière** | Auto-organisation | Populations, niches, ressources partagées | `mathematicalPopulation.js`, `mathematicalNiche.js` |
| **Évolution** | Accumulation transgénérationnelle | Mutation, recombinaison, HGT, extinction, dormance | `mutationEngine.js` |
| **Culture** | Transmission fidèle mais ouverte | Propagation de lemmes, méthodes, heuristiques entre lignages | `mathematicalCultureService.js` |
| **M8** | Questionogenesis | Génération de nouvelles questions depuis anomalies | `questionogenesisService.js` |
| **M7** | Conceptogenesis | Invention de concepts et d'invariants depuis observations | `conceptogenesisService.js` |

### Invariant fondamental

> **Lean est un vérificateur formel, pas une physique du monde.**
> Une compilation réussie établit que le terme accepté type-check dans l'environnement Lean utilisé (imports, axiomes et version compris). Elle ne valide pas automatiquement la traduction de l'énoncé naturel, la pertinence du modèle, ni l'absence d'hypothèses indésirables. Le biomimétisme décrit des choix de recherche; il ne change pas ce contrat de vérification.

### Hypothèse de recherche

> *La nature a-t-elle découvert non pas les réponses, mais les mécanismes généraux permettant de chercher ?*

Le code représente une fitness vectorielle :

$$F(L) = [P, N, I, A, T, R, C]$$

- **P** = obligations formellement résolues (vérifiées par Lean)
- **N** = nouveauté (structure jamais vue)
- **I** = gain d'information (lemmes nouveaux, simplifications)
- **A** = affordances créées (nouvelles capacités de preuve)
- **T** = transférabilité (lemme utile pour d'autres problèmes)
- **R** = résistance à la falsification (robustesse aux contre-exemples)
- **C** = coût inversé (efficacité des ressources)

La sélection Pareto compare ces coordonnées selon leur ordre numérique; elle ne rend pas les métriques valides ni comparables scientifiquement. Certaines coordonnées sont des entrées fournies par l'appelant et ont des valeurs par défaut. Dans `mathematicalPopulation.js`, `P` est calculé à partir des obligations vérifiées, `A` à partir du nombre d'affordances, et `C` à partir du coût relatif au budget; `N`, `I`, `T` et `R` peuvent recevoir des valeurs par défaut. Jusqu'à définition d'opérationnalisation, calibration et validation indépendantes de chaque métrique, le front obtenu est un outil de tri logiciel, pas une mesure de qualité mathématique établie.

---

## 2. Modèle mathématique ou logique

### 2.1 Environnement mathématique

```text
MathematicalEnvironment {
  problem: {
    statement: "Conway-99"
    domain: "combinatorics"
    assumptions: [...]
    constraints: ["99 nodes", "no multiple edges"]
    knownResults: ["Conway-98 is solvable"]
  }
  availableKnowledge: [...]
  budget: { tokens, cpu, memory }
  niches: Map<Niche>
  lineages: Map<ResearchLineage>
  artifacts: Map<ProofArtifact>
}
```

### 2.2 Lignée de recherche

```text
ResearchLineage {
  genome: {
    strategies: ["induction", "contradiction", "rewrite"]
    representationOperators: ["hybrid", "SAT"]
    researchPolicy: { explorationRate, exploitationThreshold, mutationRate }
  }
  phenotype: {
    activeTools: ["lean", "sage"]
    currentRepresentation: "SAT"
    expressedTopology: "graph"
  }
  parents: [lineageId]
  fitness: { P, N, I, A, T, R, C }
}
```

### 2.3 Niche mathématique

```text
MathematicalNiche {
  representation: "SAT" | "algebraic" | "graph"
  formulation: "Encode as SAT"
  lineages: Map<ResearchLineage>
  stigmergicTraces: [...]
  resourceHistory: [{ infoGain, timeCost, marginalYield }]
  evaluateMVT(envMeanReturnRate) → { shouldDepart, marginalYield }
}
```

### 2.4 Preuve certificée

```text
ProofArtifact {
  type: "lemma" | "theorem" | "counterexample"
  statement: "..."
  receipt: {
    status: "passed" | "failed"
    toolchainVersion: "lean-4.9.0"
    receiptDigest: "sha256:..."
  }
  isVerified() → status === "verified" && receipt !== null
}
```

### 2.5 Extrait d'antigène (Goal)

```text
GoalEpitope {
  epitopes: {
    hasAssumptions, hasQuantifier, hasImplication,
    hasConjunction, hasDisjunction, hasNegation,
    isEquality, isInequality, hasSum, hasProduct,
    hasIntegral, hasLimit, isInductive, hasFunction, hasSet
  }
  operators: ["induction", "contradiction", "rewrite", ...]
  structureHints: ["implication", "inductive_universal", ...]
}
```

### 2.6 Artefact de formalisation (pont immuable)

```text
FormalizationArtifact {
  naturalStatement: "..."            // sens humain
  formalStatement: "∀ n : Nat, ..."  // sens machine (vide = UNFORMALIZED)
  formalLanguage: "lean4"
  imports: ["Mathlib"]               // émis en tête du source Lean généré
  environmentDigest, provenance, formalizer
  // deep-freeze récursif après construction : l'artefact devient autorité
}
FormalizationRegistry {
  byNaturalFingerprint / byFormalFingerprint / byId
  getByCanonical(naturalStatement) → artefact ou null
}
```

Séquence épistémique de `verify()` — aucun `FormalResult` n'existe avant le test
de formalisation :

```text
énoncé naturel
  → FormalizationRegistry.getByCanonical()
  → formalStatement absent ? ── oui ──→ obligation UNFORMALIZED
  │                                     (compteur totalUnformalized : échec de
  │                                      formalisation, PAS échec de preuve ;
  │                                      la stratégie n'est pas pénalisée)
  └── non ──→ FormalResult(status="formalized")
               → header Lean généré par GenOS depuis l'artefact immuable
               → corps de preuve du worker après `:=`
               → generateLeanSource() = imports + header + preuve
               → LeanIncrementalGate → receipt → ProofArtifact
```

Le worker ne contrôle jamais le header : `checkSourceBinding()` exige que le
théorème prouvé corresponde exactement au `formalStatement` (les lignes d'import
générées en tête sont ignorées avant extraction du header, qui reste soumis au
contrôle de fingerprint exact). Un nom d'import non conforme (`/^[\w.]+$/`) est
rejeté pour interdire l'injection de code Lean via les imports.

---

## 3. Analogies biologiques et limites réelles

| Concept biologique | Fonction GenOS | Limite réelle |
|---|---|---|
| Antigène mathématique | `GoalEpitope` — structure features of a goal | Pas de protéine ; une structure de données |
| Sélection clonale | `ProofStrategyRepertoire.selectForGoal` | Pas de réplication ; un tri par affinité |
| Affinity maturation | `recordOutcome` met à jour le score | Pas de mutation génétique ; mise à jour de score |
| Métapopulation | `MathematicalNichePopulationService` | Pas de géographie ; des niches avec MVT |
| Stigmergie | Traces déposées dans la niche | Pas de phéromone chimique ; des marqueurs en mémoire |
| Holobionte | Host + Specialist + Immune + Memory | Pas de symbiose biologique ; orchestration |
| Exaptation | Réutiliser stratégie dans nouveau contexte | Pas de phylogenèse ; une copie de référence |
| HGT | Transfert de lemme entre niches | Pas de plasmid ; une référence |
| Dormance | Piste bloquée mais conservée | Pas de spore ; un flag booléen |
| Questionogenesis | Génération de question depuis anomalie | Pas de curiosité ; un template |
| Culture | Transmission de lemmes entre lignages | Pas de langage ; des identifiants |

---

## 4. Cas d'usage et objectifs métier

### CU1 : Preuve de Conway-99

Scénario illustratif, non résultat expérimental : on peut enregistrer des gains d'information et des coûts dans une niche SAT, comparer le rendement récent à un seuil d'écosystème, puis proposer un départ. Le service utilise une moyenne des trois derniers rendements (après au moins deux observations); cette règle inspirée du théorème de valeur marginale ne modélise pas à elle seule les hypothèses écologiques de ce théorème et ne démontre pas qu'une migration améliore la recherche. La création d'enfant et le transfert de lemme sont des opérations logicielles distinctes, chacune soumise à ses propres contrôles.

### CU2 : Foraging littéraire

Un agent cherche des résultats antérieurs. Il entre un patch (article), extrait 3 lemmes, puis le rendement chute — il migre vers un autre patch. La stigmergie évite de revenir sur un patch stérile.

### CU3 : Culture mathématique

Un lemme utile est découvert par une lignage. Il est transmis à d'autres générations avec une fidélité décroissante mais intentionnelle — seuls les lemmes de haute qualité sont propagés.

---

## 5. Architecture technique

### Services implémentés (15 services)

| Service | Fichier | Rôle |
|---|---|---|
| MathematicalEnvironment | `mathematical/mathematicalEnvironment.js` | Contrat problème + lignées + niches |
| ResearchLineage | `mathematical/researchLineage.js` | Génome/phénotype d'une lignée |
| MathematicalNiche | `mathematical/mathematicalNiche.js` | Niche avec MVT |
| ProofArtifact | `mathematical/proofArtifact.js` | Preuve + reçu kernel obligatoire |
| GoalEpitopeExtractor | `mathematical/goalEpitopeExtractor.js` | Extraction structurelle d'un but |
| ProofStrategyRepertoire | `mathematical/proofStrategyRepertoire.js` | Sélection clonale de stratégies |
| MathematicalPopulation | `mathematical/mathematicalPopulation.js` | Population avec Pareto, extinction, dormance |
| LiteratureForager | `mathematical/mathematicalLiteratureForaging.js` | Foraging MVT de la littérature |
| MutationEngine | `mathematical/mutationEngine.js` | Mutation, recombinaison, HGT, exaptation |
| MathematicalCulture | `mathematical/mathematicalCultureService.js` | Transmission culturelle de lemmes |
| QuestionogenesisEngine | `mathematical/questionogenesisService.js` | Génération de questions depuis anomalies |
| ConceptogenesisEngine | `mathematical/conceptogenesisService.js` | Invention de concepts et d'invariants (M7) |
| FormalizationArtifact | `mathematical/formalizationArtifact.js` | Pont immuable énoncé naturel → Lean, registre, deep-freeze récursif |
| MathematicalOrganismRuntime | `mathematical/mathematicalOrganismRuntime.js` + `mathematicalOrganism{Observe,Question,Explore,SelectMutate}.js` | Boucle observe → question → explore → verify → select → mutate → transmit |
| NichePopulationService | `mathematical/mathematicalNichePopulationService.js` | Allocation + migration entre niches |
| SymbiontExecutor | `mathematical/symbiontExecutor.js` | Solveurs externes branchés par représentation de niche (M3) |

### Hiérarchie d'appel

```text
MathematicalOrganism
  ├── MathematicalEnvironment (problème, budget, topologie)
  │     ├── ResearchLineage (génome, phénotype, fitness)
  │     ├── MathematicalNiche (représentation, MVT, stigmergie)
  │     └── ProofArtifact (preuve + reçu kernel)
  ├── GoalEpitopeExtractor (but → épitopes)
  ├── ProofStrategyRepertoire (sélection clonale)
  ├── MathematicalPopulation (Pareto, extinction, dormance)
  ├── LiteratureForager (foraging MVT)
  ├── MutationEngine (mutation, recombinaison, HGT)
  ├── MathematicalCulture (transmission culturelle)
  ├── QuestionogenesisEngine (génération de questions)
  └── MathematicalNichePopulationService (allocation + migration)
```

---

## 6. Boucle mathématique complète

```text
                      MATHEMATICAL WORLD
                             │
                     unknown / anomaly
                             │
                             ▼
               ┌────────────────────────┐
               │ M8 QUESTIONOGENESIS    │
               │ new niches / problems  │
               └───────────┬────────────┘
                           │
                           ▼
               ┌────────────────────────┐
               │ M7 IMAGINATION         │
               │ representations        │
               │ concepts / invariants  │
               └───────────┬────────────┘
                           │
                  possible approaches
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
        Niche A          Niche B          Niche C
           │               │               │
           └─────── M6 EVOLUTION ──────────┘
                           │
                 populations / lineages
                           │
                           ▼
                  M2 ANIMAL FORAGING
               explore ↔ exploit ↔ migrate
                           │
                           ▼
                  M3 MATHEMATICAL SYMBIOSIS
               Sage / PARI / GAP / nauty / SAT
                           │
                           ▼
                     M4 CERTIFIED NUMERICS
               intervals / exact / SDP / ARB
                           │
                           ▼
                     M1 IMMUNITY
                  falsify / formalize
                           │
             ┌─────────────┴─────────────┐
             │                           │
           FAIL                        PASS
             │                           │
        repellent                    memory
        mutation                     fossil
        extinction                   culture
             │                           │
             └────────────┬──────────────┘
                          ▼
                 M5 LITERATURE FORAGING
                          │
                          ▼
                   NEW AFFORDANCES
                          │
                           └────────────► WORLD
```

### Fermetures causales garanties par le runtime

- **Concept → Question → Niche → Population (M7/M8).** `generateQuestion()` peut
  produire un descriptor `createdNiche` ; la fonction commune
  `materializeQuestionNiche()` (`mathematicalOrganismQuestion.js`) le matérialise
  via `environment.createNiche()` + `nicheService.addNiche()` et rattache l'id réel
  à la question. Le chemin M7 (invariants structurels ou numériques issus de la
  conceptogenèse) et le chemin M8 (anomalies observées) partagent cette voie :
  aucune niche ne reste à l'état de descriptor interne.
- **Reproduction : identité globale vs localisation écologique.** L'enfant issu de
  recombinaison est enregistré dans la population parentale (`pop.addLineage`)
  **et** dans `environment.lineages` (`assimilateChild(runtime, pop, child)`, sans
  réallocation immédiate). L'environnement porte l'identité globale, la population
  la localisation écologique.
- **Obligations non formalisées.** Un énoncé sans `formalStatement` ne produit
  aucun `FormalResult` : il est compté en `totalUnformalized` (échec de
  formalisation, catégorie distincte de l'échec de preuve) et tracé comme
  `unformalized_obligation` dans l'historique du runtime.
- **Sémantique de mesure pour ablations (M6).** Les taux numériques utilisent
  `??` et non `||` (`mutationRate`, `recombinationRate`, `hgtRate`,
  `exaptationRate`, `fidelityRate`, `envMeanReturnRate`) : passer `0` désactive
  réellement le mécanisme, condition des comparaisons `FULL-NCE vs -EVOLUTION`.
  Le tirage de recombinaison vit uniquement dans `MutationEngine.recombine()` —
  `mutate()` ne pré-filtre pas (un double tirage ramènerait `r=0.2` à `~0.04`)
  et `totalMutations` n'est incrémenté que sur enfant réel. `totalHGT` n'est
  incrémenté que si `immunePassed === true` et
  `assimilationStatus === 'assimilated'` : un transfert bloqué par l'AEIS n'est
  jamais compté comme HGT réussi.

---

## 7. Portée des affirmations et validation scientifique

Les noms de services, les tests unitaires et les scénarios de démonstration établissent des propriétés de code limitées à leurs fixtures. Ils ne prouvent pas qu'une stratégie trouve davantage de théorèmes, réduit le coût de recherche, généralise à d'autres domaines ou surpasse un système tiers. Les tableaux comparatifs et les hypothèses de recherche ci-dessous doivent être lus comme des questions à mesurer, pas comme des conclusions.

Une évaluation comparative devrait pré-enregistrer les tâches et budgets, utiliser des instances séparées pour réglage et test, rapporter les versions de Lean/Mathlib et les axiomes, répéter les méthodes stochastiques avec graines publiées, comparer les ablations à budget égal, et rapporter taux de preuve vérifiée, temps/coût, échecs de formalisation et intervalles d'incertitude. Les réussites de Lean doivent être comptées séparément des conjectures, des contre-exemples et des échecs de traduction.

## 8. Comparaison avec d'autres systèmes

Aucune comparaison de performance n'est revendiquée ici. Les catégories
« sélection », « mémoire », « évolution » ou « exploration » doivent être
opérationnalisées de la même façon pour chaque système avant de conclure qu'une
fonction est absente ou qu'une approche est supérieure. Une comparaison valide
doit figer versions, tâches, budgets, outils de preuve et critères de réussite;
les résultats doivent être rapportés par tâche avec incertitude.

---

## 9. Tests et validation

La suite complète s'exécute avec :

```bash
npm --prefix backend run test:mathematical-organism
npm --prefix backend run test:math-kernel
```

`test:mathematical-organism` couvre l'environnement, les lignées, les niches, les
`ProofArtifact`, les stratégies, les populations, le foraging, les mutations, la
culture, la questionogenèse, le runtime, les symbiontes et les invariants, plus les
tests E2E structurels (`test_math_structural_a_e2e.js`, `test_math_structural_b_e2e.js`,
sans Lean : mocks et registres) et le test kernel (`test_math_kernel_e2e.js`).
`test:math-kernel` exécute le test kernel seul : **il exige un vrai Lean installé**
(`executeLeanCheck` vérifie `lean --version`) et échoue explicitement sinon —
jamais de succès simulé. La séparation est stricte : structural-tests d'un côté,
kernel-tests de l'autre.

> **Pré-ablations.** Avant toute campagne `FULL-NCE vs -EVOLUTION`, vérifier que
> le mécanisme ablaté est réellement désactivé (`taux: 0` conservé grâce à `??`),
> que `totalMutations` ne compte que les recombinaisons réussies et que `totalHGT`
> ne compte que les transferts assimilés (voir §6).

---

## 10. Références

- Charnov, E. L. (1976). Optimal foraging, the marginal value theorem. *Theoretical Population Biology*.
- Burnet, F. M. (1959). *The Clonal Selection Theory of Acquired Immunity*. Cambridge University Press.
- Hills, T. T., et al. (2015). Exploration versus exploitation in space, mind, and society. *Trends in Cognitive Sciences*.
- Arnold, B. J., et al. (2022). Horizontal gene transfer and adaptive evolution in bacteria. *Nature Reviews Microbiology*.
- Morgan, T. J. H., & Feldman, M. W. (2025). Human culture is uniquely open-ended rather than uniquely cumulative. *Nature Human Behaviour*.
- Mansouri, F. A., et al. (2020). Emergence of abstract rules in the primate brain. *Nature Reviews Neuroscience*.
- Kitano, H. (2004). Biological robustness. *Nature Reviews Genetics*.
- Schneider, R., et al. (2026). Plant Phenotypic Plasticity. *Annual Review of Plant Biology*.
- Payne, J. L., & Wagner, A. (2019). The causes of evolvability and their evolution. *Nature Reviews Genetics*.
