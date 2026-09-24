---
title: "Adaptive Epistemic Immune System"
description: "Système immunitaire épistémique adaptatif pour GenOS — reconnaissance, vérification et neutralisation des formes de conviction trompeuses."
version: 1.1.0
author: GenOS
created: 2026-09-21
tags: [epistemology, immunity, biomimicry, verification, adaptive]
---

# Adaptive Epistemic Immune System

## 1. Définition du domaine

L'Adaptive Epistemic Immune System (AEIS) est le mécanisme de contrôle épistémique
de GenOS. Il traite toute affirmation (claim) comme un **antigène** — une unité
biologique qui doit être reconnue, vérifiée ou neutralisée avant d'être promue.

Le système ne se contente pas de détecter les erreurs. Il mesure dynamiquement le
niveur de pression d'assurance (`H = f(risk, uncertainty, contradiction, novelty,
cost, evidence)`) et ajuste l'effort de vérification en conséquence, comme un
organisme ajuste sa réponse immunitaire.

### Invariant clé

> **On ne peut utiliser un nom biologique que si une propriété ou dynamique du
> mécanisme biologique est réellement implémentée et testable.**

Chaque terme biologique dans ce document correspond à une fonction, un service ou
une métrique mesurable dans le dépôt.

## 2. Modèle mathématique ou logique

### Antigène épistémique

```text
EpistemicAntigen {
  claim: Claim
  epitopes: {
    assumptions: Assumption[]
    evidence: Evidence
    validityDomain: ValidityDomain
    dependencies: ResultRef[]
    provenance: Provenance
  }
  producer: ActorIdentity
  risk: EpistemicRisk
  state: "unrecognized" | "tolerated" | "challenged" | "quarantined" | "neutralized" | "verified"
}
```

Un antigène n'est pas « la mauvaise information ». C'est une unité qui doit
être reconnue. Une affirmation vraie passe elle aussi devant le système.

### Pression d'assurance

```text
H = f(risk, uncertainty, contradiction, novelty, cost, evidence)
```

```text
risk        : danger score de l'antigène (0-1)
uncertainty : 1 - covered_constraints / total_constraints
contradiction : somme des poids de contradictions non résolues
novelty     : 1 si sujet jamais vu, 0 sinon
cost        : 1 - budget_remaining / budget_reference
evidence    : 1 - qualité moyenne des preuves
```

### Niveau d'inflammation

```text
pressure < 0.25  → baseline   (innate only)
pressure < 0.50  → lean       (innate + light adaptive)
pressure < 0.70  → adaptive   (innate + adaptive verifier)
pressure < 0.90  → inflamed   (+ counterexample worker + independent verifier)
pressure ≥ 0.90  → systemic   (+ replay + source verification + human escalation)
```

### Réponse immunitaire

```text
Tolérance   : le claim est accepté tel quel
Quarantaine : le claim est isolé, vérifié, puis accepté ou rejeté
Neutralisation : le claim est détruit/réfuté
Vérification : le claim passe avec un reçu de vérificateur indépendant
```

### Diversité cognitive effective

```text
effective_diversity = (
    functional_diversity +
    error_diversity +
    tool_diversity +
    provider_diversity +
    strategy_diversity
) / 5 × log2(species_richness) / log2(max(2, species_richness))
```

Si `effective_diversity < 0.3`, le système est en **monoculture cognitive** et
doit recruter une nouvelle niche.

### Dissonance épistémique

```text
dissonance = Σ(signaux de désalignement)
seuil warning = 5
seuil reduced_authority = 15
seuil quarantine = 30
seuil apoptosis = 50
```

## 3. Analogies biologiques et limites réelles

| Concept biologique | Fonction GenOS | Limite réelle |
|---|---|---|
| Antigène | `EpistemicAntigen` — unité claim + epitopes + producer + risk + state | Pas de protéine ; une structure de données |
| Immunité innée | `innateEpistemicImmunity` — PPR déterministes (EMPTY_EVIDENCE, SELF_VERIFICATION, etc.) | Pas de cellule ; des fonctions synchrones |
| Immunité adaptative | `adaptiveImmuneResponse` — vérificateurs spécialisés avec affinité | Pas de lymphocyte ; des objets avec `affinity` et `strategy` |
| Sélection clonale | `verifierCatalogService.selectTopClones` (≥2, falsification prioritaire) + `clonalExpansionService` (`expandClone` exécutés, `selectWinningClones` tranche sur oracle) | Pas de réplication ; tri par `fit`, 4 mutations, clones réellement exécutés, oracle requis pour trancher |
| Affinity maturation | `affinityMaturationService.matureStrategy` — mutation ciblée après résolution oracle truth, sinon `pending` | Pas de mutation génétique ; 5 mutations diagnostiquées, jamais de succès auto-déclaré |
| Mémoire immunitaire | `immuneMemoryService` — signature, recall, fuzzyRecall Jaccard, thresholdRecall, recordOutcome | Pas de cellule mémoire ; un tableau en mémoire |
| Inflammation | `epistemicInflammationAndRegulation` — pression → effort | Pas de cytokine ; un calcul de pression |
| Tolérance / T-reg | `regulatoryReview` — inhibe les rejets injustifiés | Pas de cellule T ; une fonction qui vérifie la justification |
| Apoptose | `epistemicApoptosisService` + `epistemicApoptosisAuthorityBridge` — dissonance → seuils → autopsie → révocation runtime | Pas de mort cellulaire ; un agent marqué `apoptotique` + statut DB mis à jour |
| Biocénose | `epistemicBiocenoseService` — diversité fonctionnelle des reviewers | Pas d'écosystème ; des métriques de diversité |
| Métapopulation | `epistemicMetapopulationService` — populations isolées + migration contrôlée | Pas de géographie ; des populations avec `isolation` et `migrateResults` |
| Stigmergie | `epistemicStigmergyService` + `stigmergyInterProcessBridge` — phéromones structurées + persistance | Pas de phéromone chimique ; des marqueurs en mémoire + bus de signaux |
| Holobionte | `epistemicHolobionteService` — Host + Specialist + Immune + Memory | Pas de symbiose biologique ; une orchestration de services |

## 4. Cas d'usage et objectifs métier

### Cas d'usage 1 : Vérification d'une claim de test

Un agent produit : « Le test T3 couvre 100% des obligations de sécurité. »

1. L'antigène est formé avec `claim`, `evidence: { kind: "test_result", digest: "..." }`.
2. L'immunité innée détecte `TEST_RESULT_NO_COVERAGE` si le digest est manquant.
3. L'immunité adaptative recrute `TestResultVerifier` (affinité la plus élevée).
4. Si le test échoue en reproduction, l'antigène passe en `quarantined`.
5. La mémoire immunitaire enregistre le pattern pour accélérer les futures vérifications.

### Cas d'usage 2 : Détection de monoculture cognitive

Un groupe de 4 modèles généralistes produit tous la même réponse fausse.

1. La biocénose mesure `effective_diversity ≈ 0.1` (tous identiques).
2. Le système recrute une nouvelle niche (ex: `counterexample_hunter`).
3. La pression d'assurance monte automatiquement à `systemic`.
4. Une escalade humaine est recommandée.

### Cas d'usage 3 : Auto-immunité évitée

Un agent refuse toute nouveauté car « pas de source web ».

1. Le régulateur T-reg détecte un rejet injustifié sur une revendication inhabituelle.
2. Il inhibe le rejet (`regulatorInhibited: true`).
3. Le Host accepte le claim avec une note de dette épistémique.
4. Le système évite la paralysie (FAR = 0% mais ABSTAIN < 100%).

## 5. Exemples concrets

### Exemple 1 : Mémoire immunitaire

```text
memory:
  antigen_pattern: "passing test but incomplete specification"
  domain: authentication
  known_failure: "test checks malformed token but not expired token"
  effective_response: "generate semantic obligation coverage"
  affinity: 0.91
```

La prochaine fois qu'un claim similaire apparaît, le système rappelle directement
la réponse efficace sans recalculer toute la chaîne de vérification.

### Exemple 2 : Inflammation dynamique

```text
État normal:
  pressure = 0.2 → innate only

Contradiction détectée:
  pressure = 0.45 → lean (innate + light adaptive)

Self-verification + source externe non vérifiée:
  pressure = 0.65 → adaptive (+ counterexample worker)

Multi-signaux + domaine inconnu:
  pressure = 0.85 → inflamed (+ independent verifier)

Système critique:
  pressure = 0.95 → systemic (+ replay + source + human)
```

### Exemple 3 : Métapopulation

```text
Population A (GPT)     Population B (Claude)     Population C (déterministe)
    │ isolate                │ isolate                │ isolate
    ▼                        ▼                        ▼
  résultat A              résultat B              résultat C
    │                        │                        │
    └─────── migration contrôlée (échange de résultats) ──┘
                              │
                              ▼
                    convergence indépendante mesurée
```

Si A et B arrivent à la même réponse sans s'influencer, la convergence est plus
fiable qu'un accord après discussion.

## 6. Schéma ou diagramme

```text
Une information arrive dans l'organisme GenOS
                    │
                    ▼
              Antigène cognitif
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
 Immunité innée          Immunité adaptative
 contrôles rapides       vérification spécialisée
 (PPR déterministes)    (verifierCatalog + clonal selection)
         │                     │
         └──────────┬──────────┘
                    ▼
          Réponse immunitaire
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
   tolérance    quarantaine   destruction
                              / réfutation
                    │
                    ▼
             Mémoire immunitaire
                    │
                    ▼
      meilleure réponse la prochaine fois
```

### Holobionte épistémique

```text
              Host (orchestrateur)
               │ owns final authority
     ┌─────────┼─────────┐
     ▼         ▼         ▼
 Specialist   Immune    Memory
   solver     verifier  known failures
     │         │         │
     └─────────┼─────────┘
               ▼
           host veto
```

## 7. Architecture technique

### Services implémentés

| Service | Fichier | Rôle |
|---|---|---|
| Antigène épistémique | `backend/src/services/epistemic/antigenModel.js` | `toAntigen`, `computeRisk`, `stateTransition`, `cloneAntigen` |
| Immunité innée | `backend/src/services/epistemic/innateEpistemicImmunity.js` | `scan`, `classifyDanger`, `innateFirstPass` |
| Signaux de danger | `backend/src/services/epistemic/dangerSignals.js` | `DANGER_SIGNALS`, `byCategory`, `signalByName` |
| Immunité adaptative | `backend/src/services/epistemic/adaptiveEpistemicResponse.js` | `adaptiveCheck`, `adaptiveResponse`, `scanAntigen` |
| Décision adaptative | `backend/src/services/epistemic/adaptiveEpistemicDecision.js` | `decisionFromAdaptive`, `summarize`, `describe` |
| Vérificateurs spécialisés | `backend/src/services/epistemic/verifierCatalogService.js` | `defaultCatalog`, `selectTopClones`, `clonalRank` |
| Exécution des verifiers | `backend/src/services/epistemic/verifierExecutionService.js` | `executeVerifier`, `executeVerifiers` (digests via trust registry) |
| Pont runtime worker | `backend/src/services/epistemic/verifierRuntimeBridge.js` | `buildVerifierWorker`, `executeVerifierWorkers`, indépendance vs producer avant signature |
| Registre de confiance | `backend/src/services/verifierTrustRegistry.js` | `registerVerifier`, `resolveVerifierDigest`, `listVerifierDigests` (source unique) |
| Adapters sandbox | `backend/src/services/epistemic/verifierAdapters.js` + `backend/src/services/sandboxExecutor.js` | `runTestAdapter`, `runArtifactAdapter` via `runIsolated` (allowlist) |
| Pont AEIS → promotion | `backend/src/services/epistemic/aeisPromotionBridge.js` | `bindAntigenToFormalResult`, `buildConstraintAttestations`, `evaluateReportWithAeis` |
| Contexte de gate | `backend/src/services/promotionGateContext.js` | `buildGateContext` injecte `epistemicAssembly` depuis `aeisEvaluation` |
| Mémoire immunitaire | `backend/src/services/epistemic/immuneMemoryService.js` | `recall`, `fuzzyRecall` (Jaccard), `thresholdRecall`, `recordOutcome`, `signatureFrom` |
| Réponse adaptative | `backend/src/services/epistemic/adaptiveImmuneResponse.js` | `assembleAntigen`, `adaptiveImmuneResponse`, `runAdaptivePipeline` |
| Inflammation + régulation | `backend/src/services/epistemic/epistemicInflammationAndRegulation.js` | `assignPressureTier`, `shouldInflame`, `recommendedEffort`, `regulatoryReview` |
| Apoptose épistémique | `backend/src/services/epistemic/epistemicApoptosisService.js` | `dissonanceFrom`, `niveauCorpsent`, `accumulate`, `apoptose`, `autopsy` |
| Pont autorité runtime | `backend/src/services/epistemic/epistemicApoptosisAuthorityBridge.js` | `createApoptosisAuthorityBridge`, `applyEpistemicApoptosis`, `revokeAuthority` |
| Biocénose cognitive | `backend/src/services/epistemic/epistemicBiocenoseService.js` | `cognitiveBiocenose`, `effectiveDiversity`, `isMonoculture`, `shouldRecruit` |
| Métapopulation | `backend/src/services/epistemic/epistemicMetapopulationService.js` | `createPopulation`, `migrateResults`, `independentConvergence`, `metapopulationReport` |
| Stigmergie | `backend/src/services/epistemic/epistemicStigmergyService.js` | `createPheromone`, `broadcast`, `deposit`, `subscribe`, `sharedEpistemicEnvironment` |
| Pont inter-process | `backend/src/services/epistemic/stigmergyInterProcessBridge.js` | `depositPheromone`, `readPheromones` |
| Sélection écologique | `backend/src/services/epistemic/epistemicEcologicalSelectionService.js` | `brierScore`, `weightedConsensus`, `consensusQuality`, `ecologicalSelection` |
| Challenge immunitaire | `backend/src/services/epistemic/epistemicChallengeService.js` | `createPathogen`, `runChallenge`, `challengeReport`, `challengeMetrics` |
| Intégration benchmarks | `backend/src/services/epistemic/epistemicBenchmarkIntegrationService.js` | `transformBenchmarkCase`, `executeBenchmarkCase`, `runBenchmarkSuite` |
| Expansion clonale | `backend/src/services/epistemic/clonalExpansionService.js` | `expandClone`, `mutateStrategy`, `selectWinningClones` |
| Affinity maturation | `backend/src/services/epistemic/affinityMaturationService.js` | `diagnoseError`, `targetedMutation`, `matureStrategy` |
| Homéostasie | `backend/src/services/epistemic/epistemicHomeostasisService.js` | `computePressure`, `tierFromPressure`, `feedbackEffect` |
| Holobionte | `backend/src/services/epistemic/epistemicHolobionteService.js` | `epistemicHolobionte`, `hostDecision`, `immuneSymbiontReview`, `memorySymbiontLookup` |

### Hiérarchie d'appel

```text
epistemicHolobionte(antigen, context)
  ├── specialistSymbioteSolve(antigen)        → Specialist output
  ├── memorySymbiontLookup(antigen, context)   → Memory report (recall/fuzzy Jaccard)
  ├── immuneSymbiontReview(antigen, context)
  │     ├── runAdaptivePipeline(antigen, context)
  │     │     ├── assembleAntigen(input)       → EpistemicAntigen
  │     │     ├── decisionFromAdaptive(claim, antigen, context)
  │     │     │     ├── adaptiveCheck(antigen, context)
  │     │     │     │     ├── quarantineDecision(antigen)  [innateFirstPass]
  │     │     │     │     ├── neededSignals(antigen, context)
  │     │     │     │     └── adaptiveTriggerScore(antigen, context)
  │     │     │     └── adaptiveResponse(evaluation)
  │     │     └── selectTopClones(catalog, antigen, opts)  [clonal selection, ≥2 verifiers, falsification prioritaire]
  │     ├── executeVerifierWorkers(antigen, verifiers) [adapters, sandbox réel si commande configurée]
  │     ├── runClonalSelectionCycle(parent, antigen, context) [cycle clonal exécuté]
  │     │     ├── expandClone(parent, opts)                [clonal expansion]
  │     │     ├── executeVerifierWorkers(antigen, clones)  [exécution des clones]
  │     │     ├── selectWinningClones(parent, clones)      [sélection, oracle requis pour trancher]
  │     │     └── matureStrategy(verification, oracleTruth) [affinity maturation, oracle requis sinon pending]
  │     ├── depositPheromone(signal)                 [stigmergie inter-process]
  │     └── regulatoryReview(antigen, blockReason, context) [T-reg]
  ├── hostDecision({ specialist, immune, memory }, opts)   [host veto]
  ├── cognitiveBiocenose(reviewers)                          [diversité]
  ├── computePressure(antigen)                               [homéostasie]
  ├── applyEpistemicApoptosis(db, agentId, signals)          [apoptose → révocation]
  └── recordOutcome(memory, antigen, opts)                   [pending sans oracle, jamais success auto]
```

### Schéma de la réponse immunitaire

```text
┌─────────────────────────────────────────────────────────────┐
│                    EPISTEMIC IMMUNE SYSTEM                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Antigène ──────► Immunité innée (PPR)                      │
│     │                  │                                      │
│     │                  ▼                                      │
│     │            dangerLevel?                                │
│     │            ├─ critical → quarantine                    │
│     │            ├─ inflamed → challenge                     │
│     │            ├─ elevated → challenge                     │
│     │            └─ clean    → tolerate                      │
│     │                  │                                      │
│     ▼                  ▼                                      │
│  Immunité adaptative  ◄── neededSignals                     │
│     │                                                         │
│     ├─ selectTopClones (clonal selection)                    │
│     ├─ recordOutcome (affinity maturation)                   │
│     └─ regulatoryReview (T-reg inhibition)                   │
│     │                                                         │
│     ▼                                                         │
│  Réponse immunitaire                                         │
│     ├─ tolérance                                             │
│     ├─ quarantaine                                           │
│     └─ neutralisation                                         │
│     │                                                         │
│     ▼                                                         │
│  Mémoire immunitaire (recall, fuzzyRecall, priorityRank)     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 8. Processus d'exécution ou de validation

### Pipeline complet

```text
1. ASSEMBLY
   input.claim + input.epitopes → toAntigen(input) → EpistemicAntigen

2. INNÉ
   scan(antigen) → signals[], totalDanger, dangerLevel
   classifyDanger(totalDanger, strongest) → "clean" | "baseline" | "elevated" | "inflamed" | "critical"
   innateFirstPass(antigen) → { decision, newState, innate }

3. ADAPTIF
   neededSignals(antigen, context) → ["risk_elevé", "autoverification", ...]
   adaptiveTriggerScore(antigen, context) → 0.0 - 1.0
   adaptiveCheck(antigen, context) → { innate, adaptive, decision }

4. CLONAL SELECTION
   epitopeHint(antigen) → "testResult" | "replay" | ...
   clonalRank(catalog, antigen, strategyBias) → sorted by fit
   selectTopClones(catalog, antigen, opts) → ≥2 verifiers (falsification prioritaire en top-up)

5. VÉRIFICATION BINDÉE (aeisPromotionBridge)
   bindAntigenToFormalResult(antigen) → FormalResult créé AVANT vérification
   antigen.id = formalResult.resultId, evidence.digest = formalResult.evidence.digest
   executeVerifierWorkers → receipts avec resultId/evidenceDigest du FormalResult
   indépendance évaluée vs PRODUCTEUR puis vs verifiers précédents, AVANT signature
   verifierDigest résolu via le trust registry (identité stable, jamais le type brut)

6. EXÉCUTION RÉELLE
   test/artifact → sandboxExecutor.runIsolated (allowlist sandboxCommandPolicy)
   verified dépend du exit code réel ; sans commande configurée → inconclusive (jamais simulé)
   coverage/behavior → mesures et recherches réelles sur l'antigène

7. CENSUS + GATE
   buildConstraintAttestations(verifications, obligationIds) → 2 acteurs indépendants requis
   buildGateContext injecte aeisEvaluation.assembly dans epistemicAssembly
   epistemicAssurancePolicy évalue l'assembly injectée (pas de "missing assembly" si AEIS a tourné)

8. RÉGULATION
   regulatoryReview(antigen, blockReason, context) → { inhibit, reason }
   si inhibit: suppression du rejet

9. HOST DECISION
   hostDecision({ specialist, immune, memory }, opts) → { accepted, reason }

10. MÉMOIRE
    recordOutcome(memory, antigen, { domain, outcome })
    outcome pending sans oracle (host.accepted ≠ success) ; seul un oracle tranche

11. HOMÉOSTASIE
    computePressure(antigen) → 0.0 - 1.0
    tierFromPressure(pressure) → "baseline" | "lean" | "adaptive" | "inflamed" | "systemic"
```

### Validation des tests

Suite AEIS complète (`backend/package.json` → `test:aeis`) :

```bash
npm run test:aeis
# test_aeis_e2e.js      # holobionte, adapters, receipts, binding, bon claim eligible + gate OK
# test_aeis_sandbox.js  # sandbox réel, adapters via runIsolated, indépendance avant signature
# epistemic_holobionte_test.js
# verifier_execution_test.js
# clonal_expansion_test.js
# affinity_maturation_test.js
```

Tests unitaires par service : `node backend/tests/epistemic_*_test.js`.

## 9. Comparaison avec le marché

| Système | Mécanisme dominant | Limite |
|---|---|---|
| LangChain | chaîne de vérification | Linéaire, pas de sélection dynamique |
| Vercel AI SDK | routing de modèle | Pas de mémoire immunitaire |
| Anthropic Constitutional AI | règles statiques | Pas d'apprentissage par affinity maturation |
| **GenOS AEIS** | homéostasie + clonal selection + biocénose | implémenté et testé |

### Différences clés

1. **Pas de table LOW/HIGH/CRITICAL arbitraire** : le niveau d'assurance découle
   d'une fonction de pression continue, pas d'un gate rigide.

2. **Sélection clonale réelle** : les vérificateurs sont choisis par affinité,
   pas assignés aléatoirement.

3. **Mémoire immunitaire** : le système apprend quelles formes de conviction
   sont trompeuses, pas seulement quels claims sont vrais.

4. **Auto-immunité évitée** : le régulateur T-reg empêche les rejets injustifiés.

5. **Diversité cognitive mesurée** : la monoculture est détectée et corrigée
   automatiquement.

## 10. Limites, garde-fous, non-objectifs

### Limites

- **Pas de vérité absolue** : le système mesure la fiabilité, pas la vérité.
  Un claim vérifié peut être faux ; un claim rejeté peut être vrai.

- **Mémoire en mémoire** : la mémoire immunitaire est un tableau en mémoire
  (pas persistante entre sessions). Pour une persistance, il faudrait une table
  SQLite dédiée.

- **Pas de benchmark EAB complet** : l'intégration sépare `solverAnswer`,
  `groundTruth`, `answerCorrect` et `aeisDecision`, avec
  FAR = (`answerCorrect` = false AND `aeisDecision` = PROMOTE). Un vrai dataset
  benchmark branché reste à faire.

### Garde-fous

- **Quality gate** : ≤ 400 lignes/fichier, complexité ≤ 10, ≤ 3 paramètres/fonction.
- **Règle de biométisme** : tout nom biologique doit correspondre à une
  implémentation testable. Sinon, le vocabulaire est décoratif.
- **Host veto** : le Host garde toujours l'autorité finale. Aucun symbiont ne
  peut imposer sa décision sans le consentement du Host.

### Non-objectifs

- **Pas de vérité générale** : le système ne décide pas de la vérité absolue.
  Il mesure la fiabilité d'une claim par rapport aux preuves et aux vérificateurs.

- **Pas de remplacement de l'orchestrateur** : l'AEIS est un sous-système de
  vérification, pas un remplacement de `genos-orchestrate.cjs`.

- **Pas de benchmark EAB complet** : le challenge immunitaire est un prototype.
  L'intégration avec le benchmark EAB complet reste à faire.

### Statut

- **Statut** : Partiel / Prototype exécutable

**Implémenté** :
- modèle antigène (EpistemicAntigen)
- reconnaissance innée (PPR déterministes)
- calcul homéostasie (pression D = f(risk, uncertainty, contradiction, novelty, cost, evidence))
- sélection de verifiers (affinity-based, ≥2 avec second avis falsification)
- mémoire immunitaire (signature, recall, fuzzyRecall Jaccard, thresholdRecall, recordOutcome)
- métriques de diversité (effectiveDiversity, shannonDiversity, errorDiversity, toolDiversity)
- biocénose / métapopulation / stigmergie / holobionte
- exécution réelle des verifiers (verifierExecutionService + verifierRuntimeBridge)
- adapters test/artifact via sandbox réel (sandboxExecutor, allowlist, exit code réel)
- trust registry central (digests stables type+version+policy, source unique contrats + receipts)
- indépendance vs producer évaluée avant signature du receipt (immuable après)
- FormalResult créé avant vérification, receipts bindés (resultId + evidenceDigest)
- census de contraintes depuis receipts indépendants (2 acteurs requis)
- AEIS → promotion gate injectée (epistemicAssembly depuis aeisEvaluation)
- clonal expansion exécutée (clonalExpansionService : mutateStrategy, expandClone, selectWinningClones)
- affinity maturation branchée avec oracle requis (affinityMaturationService : diagnoseError, targetedMutation, matureStrategy)
- stigmergie inter-process (stigmergyInterProcessBridge via biomimeticSignalingBus)
- apoptose intégrée à l'autorité runtime (epistemicApoptosisAuthorityBridge)
- AEIS → promotion gate (require_epistemic_assurance = true)
- Intégration benchmark partielle (epistemicBenchmarkIntegrationService : cas → EpistemicAntigen avec solverAnswer/groundTruth séparés, FAR = answerCorrect=false AND aeisDecision=PROMOTE) — pas de benchmark EAB complet

**Partiel** :
- vérification indépendante forte (receipts signés et comparés au producer, mais pas de vérification croisée multi-provider)
- recrutement réel de niches (top-up falsification prioritaire, mais biocénose sans recrutement dynamique)
- isolation réelle des métapopulations (isolation logique, pas processuelle)
- feedback homéostatique runtime (feedbackEffect implémenté mais pas encore dans la boucle de contrôle)
- `approveRun()` complet avec DB non couvert par un test E2E bon/bloqué (gate testée via buildGateContext + policy)
