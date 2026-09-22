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
3. `CognitiveRecipe` + `CognitiveComposer`
4. Branchement A-Team/Trinity via le phénotype
5. Compositions maximisant la distance cognitive
6. Confrontation + synthèse par l'orchestrateur
7. Benchmark par ablation (A-F)
8. Compilation progressive des 347 concepts
9. Mutation/recombinaison/exaptation NCE des recettes
10. Création de nouvelles clés, après validation expérimentale

## Références

- `spec/cognitive-key.schema.json` — contrat
- `backend/src/cognition/` — registre et catalogue
- `docs/08-philosophie.md` — cartographie conceptuelle existante
- ADR 0016 — effets runtime philosophiques contrôlés
- ADR 0018 — gouvernance du registre philosophique
