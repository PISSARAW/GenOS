---
title: Cognitive Key System
date: 2026-09-22
status: accepted
authors: Bruney
decision-id: 0033
---

# ADR 0033 : Cognitive Key System

## Contexte

GenOS possède un registre de concepts philosophiques (`backend/src/philosophy/`,
347 concepts) et des services par école, mais aucun pont entre la richesse
historique des concepts et la **cognition des workers**. Aujourd'hui, la
diversité des workers d'A-Team/Trinity provient essentiellement de la
compétence métier (`frontend_engineer`, `security_reviewer`), pas de la
manière de penser.

L'écueil à éviter est documenté par l'utilisateur : `concept → prompt`
produirait des dissertations philosophiques (« Analyse ce problème selon
Kant, puis selon Deleuze... ») au lieu d'altérer le raisonnement.

## Décision

Introduire une couche d'abstraction entre concepts philosophiques et agents :

```
PhilosophicalConcept
        │  extraction (manuelle, point 2)
        ▼
   CognitiveKey      — une opération mentale, pas une doctrine
        │  composition (CognitiveComposer, point 3)
        ▼
 CognitiveRecipe     — combinaison temporaire orientée mission
        │  instantiation (point 4)
        ▼
   Worker phenotype  — la cognition appartient au PHÉNOTYPE, jamais au génome
```

**Point 1 (contrat, commit 14d7ede8) et point 2 (extraction, cette révision) :**

- `spec/cognitive-key.schema.json` — contrat JSON Schema (apiVersion
  `genos.cognition/v1`, kind `CognitiveKey`), vocabulaire d'opérations
  fermé à 41 valeurs ;
- `backend/src/cognition/cognitiveKeyDefinitions.js` — agrégation des
  5 fichiers famille ;
- `backend/src/cognition/cognitiveKey{Epistemology,Structure,Logic,Interpretation,Perspective}.js`
  — catalogue de 42 clés réparties par famille cognitive :
  épistémologie/causalité (7), structure/représentation (7),
  logique/limites (6), interprétation/jeu/variation (11),
  perspectives/éthique (11) ;
- `backend/src/cognition/cognitiveKeyRegistry.js` — normalisation,
  validation schéma, intégrité croisée, couverture du vocabulaire,
  résolution de provenance multi-modules (défensive) ;
- `backend/tests/test_cognitive_key_registry.js` — tests du registre.

**Point 3 (composition, cette révision) :**

- `spec/cognitive-recipe.schema.json` — contrat CognitiveRecipe
  (`genos.cognition/v1`) : composition temporaire de clés, `ordering`
  permutation exacte, `objective` increase/avoid ;
- `backend/src/cognition/cognitiveRecipeService.js` — validation (FK
  dure sur les keys, contrairement à `derivedFrom`), métriques dérivées
  : coveredNeeds, operations distinctes, cost pondéré, **tensions
  productives** (paires conflictsWith incluses — surfacées, jamais
  rejetées), compléments réalisés ;
- `backend/src/cognition/cognitiveComposer.js` — sélection gloutonne
  qualité-diversité : gain marginal décroissant sur les besoins couverts,
  bonus d'opération nouvelle, bonus de tension productive, malus de coût,
  budgets `maxKeys`/`maxCostWeight`. Déterministe, sans LLM ;
- `backend/tests/test_cognitive_recipe_composer.js` — 12 groupes
  d'assertions (validation, FK, permutation, tensions, métriques,
  composition, déterminisme, injection).

**Point 4 (branchement runtime, cette révision) :**

- `backend/src/services/cognitivePhenotypeService.js` — déduit les
  besoins cognitifs de la mission (v1 : vocabulaire `usefulWhen` matché),
  compose une recette par worker (exclusion cumulative → diversité
  d'équipe), formate le bloc prompt (instructions opérationnelles +
  tensions productives, jamais la provenance doctrinale) ;
- `agentAutonomyPlanService.js` — attache les phénotypes aux membres
  actifs après les plans Trinity/A-Team, émet
  `COGNITIVE_PHENOTYPE_ATTACHED` ;
- `agentFleetWorkers.js` — `buildWorkerPrompt` injecte le bloc
  phénotype quand `assignment.cognitiveRecipe` existe ;
- `cognitiveComposer.js` — `excludeKeys` (diversité d'équipe) ;
- feature flag `GENOS_COGNITIVE_PHENOTYPE` (défaut OFF, opt-in —
  prérequis pour l'ablation du point 7 : le groupe témoin A tourne
  sans le flag, E avec) ;
- `backend/tests/test_cognitive_phenotype.js` — 9 groupes (flag,
  inférence, phénotype, prompt, attachement, diversité, intégration
  `buildWorkerPrompt`).

**Point 5 (distance cognitive, cette révision) :**

- `backend/src/cognition/cognitivePortfolio.js` — `CognitivePortfolio` :
  N recettes maximisant la distance cognitive paire-à-paire. Distance
  = moyenne de trois distances Jaccard (opérations, familles, besoins).
  Métriques : meanPairwiseDistance, minPairwiseDistance,
  pairwiseDistances, crossTensions (conflits déclarés entre deux
  recettes DIFFÉRENTES — matière de la confrontation du point 6) ;
- `cognitiveComposer.js` — `diversityBias` injectable dans le score de
  sélection (le portfolio guide le glouton du composer) ;
- `cognitiveKeyDefinitions.js` — métadonnée `family` ajoutée à
  l'agrégation (3e axe de distance), normalisée `null` dans le registre ;
- `cognitivePhenotypeService.js` — remplace l'exclusion cumulative du
  point 4 par le portfolio ; expose `portfolio.metrics` au plan ;
- `backend/tests/test_cognitive_portfolio.js` — 12 groupes (Jaccard,
  portfolio, couverture garantie par recette, distance paire-à-paire,
  tensions inter-recettes, attachement, prompt).

Deux propriétés du bias de diversité, apprises en implémentant :
- **cumulatif** (1/(1+porteurs)) : un bias binaire faisait converger
  les recettes impaires vers le même optimum local ;
- **plafonné par l'utilité** : sans plafond, le portfolio fabrique des
  recettes décoratives (distance 1.0, zéro couverture des besoins).

**Point 6 (confrontation & synthèse, cette révision) :**

- `backend/src/services/cognitiveSynthesisService.js` — troisième
  barrier du workerEvidenceBarrier (à côté de Trinity et A-Team) :
  confronte les analyses produites sous des recettes différentes.
  Confrontation = tensions inter-recettes AVEC matière (les deux
  dossiers ont exprimé des claims — une tension sans matière est
  écartée, pas de fausse confrontation). Synthèse STRUCTURELLE (pas
  générative, aucun LLM) selon l'opération perspective-reconciliation :
  conditions de validité (tests + uncertainties par position), niveau
  commun (intersection des clés), résidu irréconciliable explicite ;
- `workerEvidenceBarrier.js` — `applyCognitiveSynthesis` dans les deux
  chemins (partial + satisfied), échec doux comme les autres barriers ;
- `agentFleetWorkers.js` — le worker porte sa recette
  (`cognitiveRecipe` dans workerIdentity) pour la traçabilité
  dossiers → recettes ;
- `cognitivePhenotypeService.js` — `plan.cognitivePortfolio` exposé
  (recettes + métriques) pour la barrier de synthèse ;
- `backend/tests/test_cognitive_synthesis.js` — 8 groupes (positions,
  matière cognitive, confrontations ouvertes/écartées, synthèse
  structurelle, barrier inerte sans portfolio, insufficient_diverse).

## Principes

1. **Indépendance doctrinale** — le test : « peut-on expliquer comment
   utiliser cette clé sans mentionner le philosophe, l'école ou le
   mouvement ? ». Appliquée par le registre via une denylist sur label,
   instruction et questions. La provenance vit dans `derivedFrom`.
2. **Anti-décoratif** — chaque valeur de l'enum `operation` doit être
   utilisée par au moins une clé du registre (vérifié par test). Étendre
   le vocabulaire = changement de contrat explicite.
3. **Provenance souple** — `derivedFrom` référence des IDs de concepts,
   mais l'échec de résolution n'invalide jamais la clé : le registre de
   concepts évolue indépendamment (IDs renommés au fil des refontes),
   la résolution est informative uniquement.
4. **failureModes obligatoires** — une clé sans modes d'échec déclarés
   sur-déclare sa portée.
5. **Phénotype, pas génome** — le contrat impose que les recettes
   compilées soient injectées dans le phénotype temporaire du worker
   (point 4), jamais dans l'identité permanente du génome. Le génome
   peut déclarer la capacité (`cognitive_key_execution`), pas la
   combinaison.

## Alternatives

### 1. Adapter le schéma philosophical-concept existant (champ `adapters`)

Rejeté : mélangerait contrat historique et contrat opérationnel ; les
347 définitions existantes deviendraient invalides ou décoratives.

### 2. Un champ prompt par concept

Rejeté : `concept → prompt` direct produit des dissertations
philosophiques, pas des opérations de pensée. L'extraction est un travail
distinct (invariant + opération + instruction exécutable).

### 3. Générer les clés automatiquement depuis les concepts

Rejeté pour v1 : l'extraction manuelle de 20-30 clés solides (point 2)
précède toute compilation ; la génération automatique des 347 concepts
n'interviendrait qu'après validation expérimentale (point 8 du plan).

## Conséquences

### Positives

- Couche orthogonale aux topologies : `Topology ≠ Cognition`,
  `Role ≠ Cognition` ;
- Le registre de concepts reste la source historique/sémantique, la
  couche cognition consomme uniquement les opérations ;
- Contrat testé par 9 groupes d'assertions (schéma, intégrité, doctrine,
  couverture, provenance) ;
- Compatible quality gate (3 fichiers, tous < 400 lignes, complexité et
  paramètres conformes).

### Négatives

- Catalogue manuel de 42 clés : les domaines art/jeu/cinéma sont couverts
  (mimèsis, montage, cercle magique, alea, agôn, mimicry, cubisme,
  minimalisme, maximalisme, aura) mais l'extraction n'est pas exhaustive ;
- `usefulWhen` est un vocabulaire libre en v1 — le rapprochement avec le
  profil de problème attend le CognitiveComposer (point 3) ;
- La denylist doctrinale est heuristique (parfaite : elle attrape les
  mentions explicites, pas les paraphrases).

## Prochaines étapes (plan en 10 points)

1. ✅ Contrat `CognitiveKey` (commit 14d7ede8)
2. ✅ Extraction manuelle 42 clés (causalité, épistémologie, logique,
   maths, art, narration, jeu, cinéma — cette révision)
3. ✅ `CognitiveRecipe` + `CognitiveComposer` (cette révision)
4. ✅ Branchement A-Team/Trinity via le phénotype (cette révision)
5. ✅ Compositions maximisant la distance cognitive (cette révision)
6. ✅ Confrontation + synthèse par l'orchestrateur (cette révision)
7. ✅ Benchmark par ablation (A-F) — couche structurelle (cette
   révision : harness + tests + README ; la mesure de sortie requiert
   des runs runtime complets, protocole documenté)
8. Compilation progressive des 347 concepts
9. Mutation/recombinaison/exaptation NCE des recettes
10. Création de nouvelles clés, après validation expérimentale

## Références

- `spec/cognitive-key.schema.json` — contrat
- `backend/src/cognition/` — registre et catalogue
- `docs/08-philosophie.md` — cartographie conceptuelle existante
- ADR 0016 — effets runtime philosophiques contrôlés
- ADR 0018 — gouvernance du registre philosophique
