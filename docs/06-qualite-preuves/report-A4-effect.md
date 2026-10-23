# Rapport A4 — Effet observé & C4 (campagne « affirmation de mission »)

- Agent : A4
- Date : 2026-10-23
- Dépôt : `C:\Users\Shadow\Documents\GitHub\GenOS`
- Commit (working tree préexistant sale) : `f0c0643d1951ee2a79f999c09d4c139e3ad3e55c`
- Node : `v24.18.0`
- OS : Windows 11 (win32)
- Aucun fichier source modifié. Aucune action externe. Les exécutions se sont faites dans des bases isolées (`os.tmpdir()`).

## 1. Commandes exécutées

| # | Commande | Code de sortie | Date |
|---|---|---|---|
| 1 | `node backend/tests/test_mission_outcome_contract.js` | 0 | 2026-10-23 |
| 2 | `node backend/tests/test_mission_outcome_falsification.js` | 0 | 2026-10-23 |
| 3 | `node backend/tests/test_native_oracle_completion.js` | 0 (~54 s) | 2026-10-23 |
| 4 | `node backend/tests/test_promotion_evidence_dossier.js` | 0 (A3) | 2026-10-23 |

Fichiers de travail temporaires : aucun fichier A4 supplémentaire dans le dépôt ; les scripts A1/A2/A3 déjà cités dans leurs rapports ont été réutilisés pour la lecture.

## 2. Points d'instrumentation existants (services inspectés)

Inspection en lecture seule des cinq services nommés par la tâche. Aucun n'observe un effet métier *après application* ; tous observent un état immédiat ou structurel.

| Service | Fichier | Lignes | Ce qu'il enregistre | Nature | Hook C4 ? |
|---|---|---|---|---|---|
| `agentEvolutionService` | `backend/src/services/agentEvolutionService.js` | 270 | `recordGenomicOutcome` met à jour `lineage_nodes.score` / `state_summary` après une mission (`Completed mission outcome: …`). `recordWorkerLineage` persiste un score de fitness validé. | Score de fitness génomique post-mission, mais appelé manuellement (tests `test_swarm_genetics_arena_active.js`), **non câblé** à `approveRun` ni au verdict `verified`. | Non |
| `cognitiveSynthesisService` | `backend/src/services/cognitiveSynthesisService.js` | 191 | `applyCognitiveSynthesis` déclenche `recordOutcome` → `cognitiveRecipeMemoryService.recordMissionOutcome`. | Gain structurel par recette (claims/tests), pas qualité finale. | Non |
| `cognitiveRecipeMemoryService` | `backend/src/services/cognitiveRecipeMemoryService.js` | 166 | Table `cognitive_recipe_performance` : `runs`, `observed_gain`, `useful_dossiers`, `last_evidence_json`. | Agrégat structurel, aucune mesure d'effet réel. | Non |
| `missionEvidenceCollector` | `backend/src/services/missionEvidenceCollector.js` | 169 | Collecte dossiers, runs, télémétrie, état d'homéostasie ; `buildEvidenceFlags` force `testsPassed: false` (commentaire : « No trusted test-execution receipt producer is wired »). | Preuve d'exécution immédiate, pas d'effet différé. | Non |
| `homeostasisService` | `backend/src/services/homeostasisService.js` | 311 | `evaluateMissionHomeostasis`, `persistTransitionReceipt`, états `homeostasis_states`. | Invariants fonctionnels/structurels au moment de la clôture. | Non |

Conclusion : **aucun hook C4** (métrique post-application avec horizon et environnement déclarés) n'existe dans le code pour le parcours `strategy_execution_runs` / `mission_outcome`. Les métriques disponibles (`lineage_nodes.score`, `cognitive_recipe_performance.observed_gain`) sont structurelles et ne sont pas reliées au verdict `verified` ni à `approveRun`.

## 3. Tentative de définition C4 pour la mission bornée subset-sum

### 3.1 Mission et verdicts disponibles

- Domaine : `subset_sum` (seul domaine exercé bout-en-bout par A2/A3).
- Verdict `verified` de `missionOutcomeContract.evaluate` : couverture de toutes les obligations par deux reçus indépendants (quorum), attestation native non expirée, reconstruction formelle, comparaison de domaine. Il décrit **l'artefact borné observé immédiatement**, pas l'effet ultérieur (ADR 0441 : « Le verdict décrit l'artefact borné observé immédiatement, pas l'effet ultérieur en production. »).
- Résultat de la tâche observé dans le run : indices `[0, 2]`, somme `10` (test `test_bounded_worker_delegation.js`, `nativeDispatch`) — c'est une **sortie de calcul**, pas un effet après application.

### 3.2 Métrique candidate

| Élément C4 | Valeur proposée | Statut |
|---|---|---|
| Métrique | Score de qualité du worker (`qualityEvidenceStatus.status === 'verified'`) ou résultat de la tâche (somme cible atteinte). | Définissable, mais identique à la preuve C2 (oracle). |
| Horizon | `attestation.validUntil` (~minutes, ex. `2026-10-23T05:39:00.676Z` dans A2). | Horizon de **validité de la preuve**, pas d'effet métier. Aucun horizon d'effet déclaré dans le contrat. |
| Environnement | Aucun champ `environment` / `horizon` dans `mission_outcome` (v1/v2) ni dans la promotion (`buildPromotion`, `strategyContractService`). | **Non déclaré.** |

### 3.3 Observation après `approveRun`

- Dans `test_native_oracle_completion.js` (`humanApproval`), après `approveRun` le statut du run passe à `completed` et la reprise est idempotente (nonces non reconsommés). C'est une **clôture de promotion**, pas une mesure d'effet.
- Aucune lecture post-application n'est effectuée : pas de re-calcul dans un environnement distinct, pas de comparaison à une ligne de base, pas de fenêtre temporelle, pas de témoin.
- Le seul observable « qualité » (`qualityEvidence` porté par l'événement terminal `AGENT_COMPLETED`) est vérifié *avant* l'approbation (A2) et reste inchangé après.

### 3.4 Verdict C4

**C4 = non mesuré (unmeasured) pour la mission subset-sum.** Il n'y a pas d'application réelle à observer (la mission est un calcul borné dont le résultat est la preuve), pas de métrique d'effet distincte de C2, pas d'horizon d'effet ni d'environnement déclarés, et pas de hook dans le code. Conformément au protocole (`qualification-issue-mission.md`) : « Sans mesure, conserver `unknown` ; ne pas extrapoler depuis C2. » Aucun `skipped`/`unmeasured`/`inconclusive` ne vaut PASS.

## 4. Invalidation des preuves périmées

### 4.1 Conditions dans le code

- `missionOutcomeContract.validNativeProof` (`backend/src/services/missionOutcomeContract.js`, l. 128-136) :
  - refus si `delegated` ;
  - refus si attestation absente, schéma ≠ `genos.native-oracle-attestation/v1`, `accepted !== true`, `runId !== event.runId` ;
  - refus si `validUntil` non fini ou `Date.now() >= Date.parse(attestation.validUntil)` (l. 133-134) ;
  - refus si `proof.saved.evaluation.allAccepted !== true`.
- `missionOutcomeContract.validFormalResult` (l. 115-126) : reconstruit le résultat formel (`createFormalResult`) et compare `resultId`, `semanticFingerprint`, `evidence.digest`, et le domaine de validité (`statement` + `constraints` triées) au domaine de l'oracle. Toute mutation d'empreinte ou de domaine → `false`.
- `nativeOracleProof.assertCurrent` (`backend/src/services/epistemic/nativeOracleProof.js`) : vérifie l'autorité du run (hash), le sujet et le rapport (digests), puis `Date.now() >= Date.parse(validUntil)` → `ORACLE_ATTESTATION_EXPIRED`. Vérifie aussi le digest des reçus.
- `nativeOracleProof.assertReceiptDomain` : si `receipt.verifierDigest !== expected` → `ORACLE_VERIFIER_IMPLEMENTATION_CHANGED` (changement de version d'oracle).
- `nativeOracleProof.assertReceiptTime` : si `checkedAt` hors fenêtre ou > `validUntil` → `ORACLE_RECEIPT_STALE`.

### 4.2 Tests réels exécutés (péremption)

| Cas | Test / sonde | Résultat observé | Code de sortie |
|---|---|---|---|
| Preuve expirée (oracle) | `test_native_oracle_completion.js` → `nativeCompletionProbes.expiredView` (force `Date.now = validUntil + 1 ms`) | `proofs.assertCurrent` rejette `EXECUTION_AUTHORITY_EXPIRED` ; `nativeOracleInspection.inspect(...).current.satisfied === false` ; décision historique conservée (`gate.historical(...).acceptance.value.status === 'completed'`). | 0 |
| Attestation expirée (contrat) | `test_mission_outcome_falsification.js` → `expired-attestation`, `expired-attestation-now` | verdict `inconclusive` (pas `verified`). | 0 |
| Mutation d'empreinte/domaine | `test_mission_outcome_falsification.js` → `I-changed-*` ; A1 a extrait `validFormalResult` directement (VFR-*) | toutes rejetées (`false` / `inconclusive`). | 0 |

### 4.3 Changement de dépendance / version d'oracle

- **Code seulement** : aucune suite existante ne change le digest du vérificateur (`assertReceiptDomain` → `ORACLE_VERIFIER_IMPLEMENTATION_CHANGED`) ni une dépendance d'oracle pour observer l'invalidation. `validFormalResult` ne couvre pas le `verifierDigest` (couvert côté oracle par `assertReceiptDomain`).
- La condition est présente et cohérente (digest attendu issu de `verifierTrustRegistry.ensureVerifier(type).digest`), mais **non exercée par un test réel** dans cette campagne. À marquer comme code-only, pas comme PASS.

### 4.4 Conclusion péremption

- Expiration temporelle : **testée et refusée** (oracle + contrat).
- Altération d'empreinte/domaine : **testée et refusée** (contrat).
- Changement de version/dépendance d'oracle : **code seulement** (non testé).

## 5. Faux positifs C4

- Aucun cas observé où le verdict `verified` aurait été contredit par un effet observé, parce qu'**aucun effet n'a été observé** (C4 non mesuré). Il est impossible, avec l'instrumentation actuelle, de produire un faux positif C4 ni de le réfuter.
- Par construction (ADR 0441, ADR 0613), le verdict `verified` est une affirmation sur l'artefact borné et le quorum d'oracles, pas sur l'effet ultérieur. Les invariants `missionClosureReason` bloquent la clôture si le statut n'est pas `verified`, mais n'introduisent aucune vérification d'effet.
- Cas à surveiller pour A5 : toute promotion `completed` sans dossier obligatoire (A3 a montré que `promotion.require_evidence_dossier_v2` n'est pas activé par défaut) reste une porte ouverte où un effet non vérifié peut être traité comme acquis.

## 6. Cas non mesurés et limites de l'horizon

| Cas | Statut | Justification |
|---|---|---|
| Effet métier post-application (C4) | **Unmeasured** | Pas de métrique d'effet distincte, pas d'horizon d'effet, pas d'environnement déclarés, pas de hook dans le code. |
| Changement de version/dépendance d'oracle | Code only | `assertReceiptDomain` présent mais aucune suite ne l'exerce. |
| Topologies déléguées et clôture alternative | Non exercé | A5. |
| Domaines autres que `subset_sum` | Non couvert | Seul `subset_sum` est exercé bout-en-bout. |
| Preuve formelle native (Lean) | Non mesuré | Outil absent. |
| Effet à long terme (> `validUntil`) | Non mesurable | `validUntil` est de l'ordre de la minute ; aucune fenêtre d'observation au-delà. |

Aucun `skipped`/`unmeasured`/`inconclusive` ne vaut PASS. Le statut C4 de cette campagne est donc **non-PASS**, et la capacité « affirmation de mission » ne peut pas être déclarée opérationnelle sur le niveau C4.

## 7. Verdict A4

- Critère de succès A4 (au moins un cas où l'effet est observé et documenté) : **non atteint** — C4 est non mesuré, documenté comme tel.
- Critère de succès A4 (au moins un cas de preuve périmée invalidée) : **atteint** pour l'expiration temporelle et l'altération d'empreinte/domaine ; **non atteint** pour le changement de version/dépendance (code only).
- Critère de succès A4 (0 faux positif C4 non expliqué) : **vacuellement respecté** — aucun faux positif ne peut être observé sans mesure ; absence documentée.
- Maillons manquants à signaler pour A5 :
  1. Aucun champ `effectMetric` / `horizon` / `environment` dans `mission_outcome` v1/v2 ni dans la promotion.
  2. `recordGenomicOutcome` et `cognitiveRecipeMemoryService` ne sont pas câblés à `approveRun` ni au verdict `verified`.
  3. `missionEvidenceCollector.buildEvidenceFlags` force `testsPassed: false` faute de producteur de reçu de test de confiance.
  4. Aucune observation post-application n'est prévue dans `approveRun`/`recovery.resume`.
  5. Le changement de version d'oracle n'est pas couvert par un test réel.

Rapport produit sans modification de fichier source. Porte qualité non réexécutée (aucun source touché), conformément à A1/A2/A3.