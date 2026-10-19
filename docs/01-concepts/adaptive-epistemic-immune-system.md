---
title: "Adaptive Epistemic Immune System"
description: "Système immunitaire épistémique adaptatif pour GenOS — reconnaissance, vérification et neutralisation des formes de conviction trompeuses."
version: 1.3.0
author: GenOS
created: 2026-09-21
tags: [epistemology, immunity, biomimicry, verification, adaptive]
---

# Adaptive Epistemic Immune System

- **Statut** : Implémenté pour les prédicats de commande exacts ; heuristiques
  d'ordonnancement non calibrées
- **Portée** : intégrité procédurale, reproduction et promotion de claims
  mécanisables ; pas de vérité générale
- **Dernière revue** : 2026-10-18

## 1. Définition du domaine

L'Adaptive Epistemic Immune System (AEIS) est le mécanisme de contrôle épistémique
de GenOS. Il traite toute affirmation (claim) comme un **antigène** — une unité
biologique qui doit être reconnue, vérifiée ou neutralisée avant d'être promue.

> **Distinction de vocabulaire** : l'antigène de l'AEIS est un claim épistémique.
> Les « clusters d'antigènes » de la [campagne immunitaire de remédiation
> sécurité](../adr/0649-campagne-immunitaire-remediation-securite.md) regroupent
> des alertes de sécurité par cause ; ce sont des objets distincts qui partagent
> la métaphore, pas le registre ni les preuves.

Le système ne se contente pas de détecter les erreurs. Il calcule un score ordinal
de pression d'assurance à partir de signaux observables et ajuste l'effort de
vérification. Ce score est une **politique d'ordonnancement heuristique** : ce
n'est ni une probabilité, ni un estimateur validé de vérité ou d'efficacité.

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
P_policy = Σ(w_i × signal_i) / Σ(w_i)
```

```text
risk        : danger score de l'antigène (0-1)
uncertainty : 1 - covered_constraints / total_constraints
contradiction : somme des poids de contradictions non résolues
novelty     : 1 si sujet jamais vu, 0 sinon
cost        : 1 - budget_remaining / budget_reference
evidence    : 1 - qualité moyenne des preuves
```

La politique embarquée `aeis-pressure-routing-v1` utilise les poids
`0.35/0.20/0.20/0.10/0.10/0.05` et les frontières ci-dessous. Ces valeurs sont
des **valeurs d'ingénierie non calibrées**, choisies pour obtenir plusieurs
niveaux d'effort et préserver leur monotonie. Aucun benchmark publié ne permet
actuellement de leur attribuer une efficacité, une sensibilité ou un taux
d'erreur. Les tests vérifient le calcul, les bornes et la monotonie, pas la
validité empirique de la politique. Le runtime expose donc
`calibrationStatus: uncalibrated_engineering_default`.

### Niveau d'inflammation

```text
pressure < 0.25  → baseline   (innate only)
pressure < 0.50  → lean       (innate + light adaptive)
pressure < 0.70  → adaptive   (innate + adaptive verifier)
pressure < 0.90  → inflamed   (+ counterexample worker + independent verifier)
pressure ≥ 0.90  → systemic   (+ replay + source verification + human escalation)
```

Ces frontières sont configurables par appel. Toute valeur destinée à piloter
une décision de production doit être liée à une campagne de calibration avec
vérité terrain, métriques de faux positifs/faux négatifs et version de politique.

### Réponse immunitaire

```text
Tolérance   : le claim est accepté tel quel
Quarantaine : le claim est isolé, vérifié, puis accepté ou rejeté
Neutralisation : le claim est détruit/réfuté
Vérification : le claim passe avec un reçu de vérificateur indépendant
```

### Diversité cognitive effective

```text
observed_diversity = moyenne(
    species_richness / 8,
    functional_diversity,
    error_diversity,
    tool_diversity,
    provider_variety,
    strategy_diversity,
    normalized_shannon_balance
)
```

Chaque composante est bornée dans `[0, 1]`. La composante de richesse augmente
quand une espèce distincte est ajoutée, jusqu'aux huit niches du catalogue ;
l'équilibre de Shannon mesure séparément la répartition. Le facteur logarithmique
tautologique de la version précédente a été supprimé.

Cet indice reste descriptif et non calibré
(`uncalibrated_descriptive_index`). Par défaut, la monoculture n'est plus
déduite d'un seuil magique à `0.3`, mais de minima structuraux explicites : au
moins deux types, deux niches et deux stratégies distincts. Un seuil scalaire
n'est appliqué que s'il est fourni explicitement par une politique calibrée.
La variété de providers ne prouve jamais leur indépendance épistémique.

La décision et ses conséquences de compatibilité sont consignées dans
[l'ADR 0642](../adr/0642-borner-les-heuristiques-aeis.md).

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
| Sélection clonale | `verifierCatalogService.selectTopClones` (≥2, falsification prioritaire) + `clonalExpansionService` (`expandClone` exécutés, `selectWinningClones` tranche sur oracle) | L'oracle n'est pas créé par AEIS ; sans vérité terrain indépendante, le cycle reste `pending` et ne démontre rien |
| Affinity maturation | `affinityMaturationService.matureStrategy` — mutation ciblée après résolution oracle truth, sinon `pending` | Pas de mutation génétique ; 5 mutations diagnostiquées, jamais de succès auto-déclaré |
| Mémoire immunitaire | `immuneMemoryService` + `immuneMemoryRepository` — rappel et résultats confirmés | SQLite par organisation, projet et workspace ; le rappel seul ne tranche pas l'issue |
| Inflammation | `epistemicInflammationAndRegulation` — pression → effort | Pas de cytokine ; politique heuristique non calibrée, sans interprétation probabiliste |
| Tolérance / T-reg | `regulatoryReview` — inhibe les rejets injustifiés | Pas de cellule T ; une fonction qui vérifie la justification |
| Apoptose | `epistemicApoptosisService` + `epistemicApoptosisAuthorityBridge` — dissonance → seuils → autopsie → révocation runtime | SQLite conserve la dissonance et l'autopsie ; statuts blocked puis apoptosis, avec isolation Quarantine |
| Biocénose | `epistemicBiocenoseService` — variété observée des reviewers | Pas d'écosystème ; indice descriptif non calibré, sans mesure d'indépendance |
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

1. La biocénose observe un seul type, une seule niche et une seule stratégie.
2. La règle structurelle signale la monoculture, indépendamment du score agrégé.
3. Le système recrute une nouvelle niche (ex: `counterexample_hunter`).
4. Cette diversification élargit la procédure ; elle ne prouve pas que le
   nouveau vérificateur est indépendant ni que la conclusion est vraie.

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

### Exemple 2 : Routage heuristique de l'effort

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

Ces valeurs illustrent la table de routage `v1`. Elles ne sont pas des mesures
d'efficacité et ne constituent pas un résultat de calibration.

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

Si A et B arrivent à la même réponse sans s'influencer, le runtime enregistre une
convergence procédurale. Il ne la transforme pas en preuve de vérité : une erreur
corrélée, des données communes ou une même famille de modèles restent possibles.

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
  └── immuneMemoryRepository.resolve(db, preuve signée)     [issue seulement après relecture]
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
    immuneMemoryRepository.save(db, observations, scopeId)
    immuneMemoryRepository.resolve(db, runId + scopeId + assemblyId + résultat)
    issue déduite des reçus signés et du prédicat exact ; sinon pending

11. HOMÉOSTASIE
    computePressure(antigen) → 0.0 - 1.0
    tierFromPressure(pressure) → "baseline" | "lean" | "adaptive" | "inflamed" | "systemic"
```

### Validation des tests

Le gate courant a une portée volontairement étroite. Il distingue trois classes :

| Classe de claim | Traitement AEIS | Ce qui est établi |
|---|---|---|
| Prédicat de commande exact | Promouvable si quorum, reçus et assemblage sont valides | La commande observée satisfait le prédicat dans les réplicas exécutés |
| Claim de domaine avec oracle externe | Conservé `pending` jusqu'à un témoin ou verdict indépendant admissible | Seulement ce que l'oracle et sa portée attestent |
| Claim sémantique libre (`refactoring sain`, résumé fidèle, architecture correcte) | Non promouvable automatiquement | Provenance et procédure seulement ; pas la vérité du claim |

Un claim mécanisable doit exprimer exactement le prédicat exécuté. Les deux
répliques doivent pointer vers des répertoires existants, distincts et situés
dans le workspace de l'agent :

```json
{
  "statement": "echo OK outputs \"OK\"",
  "test": {
    "command": "echo OK",
    "expectOutput": "OK",
    "replicas": {
      "proof": { "cwd": "<workspace>/replica-a" },
      "source": { "cwd": "<workspace>/replica-b" }
    }
  }
}
```

L'opérateur fournit `GENOS_EPISTEMIC_RECEIPT_SECRET` et un
`GENOS_EPISTEMIC_RECEIPT_KEY_ID` stable. La rotation conserve les anciennes
clés dans `GENOS_EPISTEMIC_RECEIPT_PREVIOUS_KEYS` pendant la période de
rétention. Les assemblées nouvelles signent également le run et la portée de
mémoire; celles qui précèdent cette liaison restent lisibles pour l'audit.
L'option `problem_profile.multi_provider_verification` active la revue par
fournisseurs. `problem_profile.aeis_provider_allowlist` doit alors désigner au
moins deux fournisseurs distincts configurés; une revue manquante, divergente
ou réfutante bloque la promotion. Les avis provider ne remplacent pas les
reçus indépendants des vérificateurs locaux.

Cette frontière n'est pas présentée comme une solution générale au problème de
la vérification des affirmations non mécanisables. AEIS refuse de convertir un
jugement de LLM, une convergence textuelle ou une diversité déclarée en preuve.

Suite AEIS complète (`backend/package.json` → `test:aeis`) :

```bash
npm --prefix backend run test:aeis
# Inclut approveRun() avec SQLite, reçus, mémoire, fournisseurs, niches,
# processus séparés, homéostasie et benchmark AEIS EAB local.
```

Tests unitaires par service : `node backend/tests/epistemic_*_test.js`.

## 9. Qualification opérationnelle

La commande de qualification est `npm --prefix backend run test:aeis`.
Le runner inclut les unités, les intégrations SQLite, les processus provider
et la régression EAB locale.

| Capacité | Preuve exécutable |
|---|---|
| Rappel de contre-preuve, portée et rétention à capacité pleine | `test_epistemic_immune_memory_persistence.js` |
| Abstention sur timeout sans fausse réfutation | `test_aeis_execution_timeouts.js` |
| Identités, accord et désaccord providers | `test_aeis_provider_process_roundtrip.js`, `test_aeis_provider_persistence.js` |
| Processus séparés, délais et bornes d'entrée | `test_aeis_process_isolation.js` |
| Recrutement de niches et budget | `test_aeis_niche_recruitment.js`, `test_aeis_runtime_integrations.js` |
| Statut non calibré et monotonie des indices | `epistemic_homeostasis_test.js`, `epistemic_biocenose_test.js` |
| Quorum signé et lignage lors de la ré-arbitration | `test_aeis_homeostatic_runtime.js`, `test_aeis_verifier_lineage.js` |
| Autorité durable et révocation des descendants | `test_aeis_authority_persistence.js` |
| Approval et contre-preuve dédupliquée sur SQLite | `test_approve_run_deferred_promotion.js` |
| Approval avec deux processus provider ; refus du désaccord et du quorum manquant | `test_aeis_provider_approve_run.js` |
| Régression adversariale de promotion | `benchmarks/eab/run-aeis-eab.cjs` |

### Autorité persistée

`epistemicAuthorityState` conserve les événements dans `aeis_dissonance_events`
et l'état dans `aeis_agent_dissonance`. Dans `approveRun()`, une contre-preuve
d'exécution signée vaut un point, une fois par run et prédicat canonique.
Une répétition, un timeout ou un avis provider divergent ne constituent pas
une nouvelle contre-preuve.

- À 5 points : avertissement conservé en base.
- À 15 points : lancement de missions et délégation refusés.
- À 30 points : agent marqué `blocked`, isolation `Quarantine` et autorité
  runtime refusée pour lui et ses descendants.
- À 50 points : statut `apoptosis` et autopsie persistée.

`agentAuthorityService` et `missionExecutionAuthority` consultent cet état
à chaque autorisation. `approveRun()` vérifie aussi l'autorité avant la
vérification et après la ré-arbitration. Ces gardes retirent les droits ;
ils ne promettent pas de tuer un processus externe déjà lancé.

Le quorum obligatoire et les contre-preuves exécutées ne peuvent pas être
inhibés par le régulateur. Les assemblées refusées restent persistées pour
l'audit et la mémoire, y compris si la revue provider refuse la promotion.

## 10. Limites, garde-fous, non-objectifs

### Limites

- **Pas de vérité absolue** : le système mesure la fiabilité, pas la vérité.
  Un claim vérifié peut être faux ; un claim rejeté peut être vrai.

- **Portée mécanisable seulement** : la promotion automatique couvre actuellement
  les prédicats de commande exacts. La santé d'un refactoring, la fidélité d'un
  résumé ou la pertinence d'une architecture exigent un oracle externe, une
  revue humaine ou une politique de domaine spécifique.

- **Heuristiques non calibrées** : la pression, l'indice de diversité et leurs
  valeurs par défaut organisent l'effort. Ils ne doivent pas être rapportés
  comme des probabilités de succès ou des mesures d'efficacité.

- **Pas d'indépendance créée par réplication** : deux providers, processus ou
  modèles peuvent partager données, méthodes et erreurs. Les tests à réponses
  contrôlées qualifient le protocole et ses refus, pas une indépendance réelle.
  La sélection clonale requiert un oracle extérieur pour apprendre ou trancher.

- **Mémoire persistée et bornée** : les observations AEIS sont conservées en
  SQLite par organisation/projet/workspace. Une issue n'est inscrite qu'après
  relecture de l'assemblée signée; les anciennes entrées globales ne sont pas
  attribuées à un tenant par supposition. La rétention est bornée par portée.

- **Évaluation EAB** : `benchmarks/eab/run-eab.cjs` extrait les 446 questions
  de catégorie 5 LoCoMo depuis le corpus et les apparie aux prédictions. Il
  mesure abstention, couverture, taux de réponse erronée, F1 lexical et écart
  métrique. Le corpus officiel n'est pas redistribué avec GenOS.

- **Régression AEIS EAB** : `benchmarks/eab/run-aeis-eab.cjs` exécute quatre
  cas locaux sur le runtime de promotion et mesure acceptations, refus,
  latence et nombre de résultats de vérification. Elle n'est pas une mesure
  sur les 446 questions LoCoMo.

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

- **Portée EAB** : le runner de catégorie 5 exige le corpus LoCoMo et un fichier
  de prédictions complet; un sous-ensemble est explicitement marqué `partial`.

### Statut

- **Statut** : intégré au chemin de promotion pour les prédicats de commande
  vérifiables; les capacités décrites ci-dessous ont des tests E2E locaux.

**Implémenté** :
- modèle antigène (EpistemicAntigen)
- reconnaissance innée (PPR déterministes)
- calcul homéostatique d'un score ordinal non calibré pour router l'effort
- sélection de verifiers (affinity-based, ≥2 avec second avis falsification)
- mémoire immunitaire (signature, recall, fuzzyRecall Jaccard, thresholdRecall, recordOutcome)
- persistance SQLite par portée et résolution après validation de l'assemblée
  signée; rotation de clé par identifiant et rétention des assemblées
- indice descriptif de variété observée et détection structurelle de monoculture
- biocénose / métapopulation / stigmergie / holobionte
- exécution réelle des verifiers (verifierExecutionService + verifierRuntimeBridge)
- adapters test/artifact via sandbox réel (sandboxExecutor, allowlist, exit code réel)
- trust registry central (digests stables type+version+policy, source unique contrats + receipts)
- indépendance vs producer évaluée avant signature du receipt (immuable après)
- FormalResult créé avant vérification, receipts bindés (resultId + evidenceDigest)
- census de contraintes depuis receipts indépendants (2 acteurs requis)
- AEIS → promotion gate injectée (epistemicAssembly depuis aeisEvaluation)
- clonal expansion exécutée (clonalExpansionService : mutateStrategy, expandClone, selectWinningClones)
- recrutement de niches conditionnel à la pression, à la preuve observée et au
  budget par claim (maximum 8 exécutions)
- affinity maturation branchée avec oracle requis (affinityMaturationService : diagnoseError, targetedMutation, matureStrategy)
- stigmergie inter-process (stigmergyInterProcessBridge via biomimeticSignalingBus)
- dissonance, événements dédupliqués et autopsie persistés ; révocation intégrée
  aux autorisations de mission, de délégation et de runtime
- AEIS → promotion gate (require_epistemic_assurance = true)
- feedback homéostatique appliqué à la ré-arbitration runtime et au veto final
- revues multi-provider structurées, distinctes, persistées en SQLite et
  opposables lorsqu'elles sont activées par la politique du contrat
- processus enfants séparés pour les revues provider, avec environnement
  réduit, base SQLite éphémère, délai borné, heap Node limité et sorties bornées
- `approveRun()` couvert avec SQLite sur le chemin accepté et les refus de
  reçus absents ou altérés
- Intégration AEIS et runner EAB LoCoMo catégorie 5 disponibles; le rapport
  compare l'abstention observable aux 446 pièges et expose l'artéfact du F1
  lexical lorsque le gold est `undefined`.
- benchmark local AEIS EAB exécutant quatre cas adversariaux sur le vrai pont
  de promotion, raccordé à `npm test`

**Bornes vérifiées** :
- au maximum 32 claims par rapport, traitées séquentiellement ; de 2 à 8
  exécutions de vérification par claim et au maximum 8 processus par lot
- heap Node des workers limité à 128 Mio ; cela ne borne pas la mémoire totale
  du processus. La sortie JSON est distincte des logs et vidée avant sa fermeture
- le contrat promouvable est actuellement une proposition exacte de type
  `<commande> outputs "<valeur>"` ou `<commande> exits with code 0`;
  une affirmation libre ou seulement apparentée à un test est refusée
- le processus enfant isole l'exécution provider, mais l'adapter de commandes
  ne constitue pas un conteneur ni une garantie d'isolation du système entier
- les tests provider utilisent des réponses contrôlées; ils qualifient le
  transport, le binding et les vetos, mais ne démontrent ni indépendance
  épistémique ni efficacité sur des comptes et modèles externes réels
- le benchmark local ne permet pas de déclarer un score sur LoCoMo sans le
  corpus et les prédictions correspondantes
