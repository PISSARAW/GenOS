# Rapport — Campagne réelle Phase 1 (GenOS)

**Date d'exécution :** 2026-10-23  
**Statut :** parcours E2E combiné réussi (attestation native + dossier de preuve + `approveRun`).  
**Script de travail (temporaire, hors dépôt) :** `%TEMP%\opencode\campagne_phase1.js`  
**Code de sortie du script :** `0`  
**Durée totale mesurée :** `15565 ms`  
**Base de données :** SQLite temporaire (répertoire temporaire, supprimé en fin de run).

## 1. Objectif

Exécuter un scénario E2E réel combinant, sur un même run natif :

1. l'attestation native par processus enfant (deux exécutions, zéro jeton modèle) ;
2. un dossier de preuve (`promotionEvidenceDossierService`) lié au run et au reçu de rejeu causal ;
3. l'appel à `strategyExecutionService.approveRun` avec preuve d'approbation humaine.

Mesurer les compteurs réels de faux acceptations (cas invalides acceptés) et de faux rejets (cas valides rejetés), sans fixture pour l'attestation.

## 2. Infrastructure réutilisée

- `backend/tests/test_bounded_worker_delegation.js` (`seed`) pour le monde de test (organisation, projet, workspace, agents, mission).
- `backend/tests/helpers/nativeWorkerFixtures.js` (`scoped`) pour le contrat de méthode bornée.
- `backend/src/services/agents/subOrchestratorDispatchService.js` pour le dispatch réel du worker enfant.
- `backend/src/services/epistemic/nativeOracleJournal.js` pour lire l'attestation et l'acceptation réelles.
- `backend/src/services/versionedCausalStateService.js` pour créer/ajouter/rejouer l'état causal.
- `backend/src/services/promotionEvidenceDossierService.js` et `promotionEvidenceContract.js` pour le dossier, le scellement et l'immuabilité.
- `backend/src/services/strategyExecutionService.js` (`approveRun`, `getPromotionApprovalDigest`) pour la promotion différée.

## 3. Attestation native (processus enfant)

Résultat observé sur le run natif :

| Indicateur | Valeur mesurée |
|---|---:|
| `attestation.value.accepted` | `true` |
| `costs.processes` | `2` |
| `costs.modelTokens` | `0` |
| `costs.localComputeUsd` | `null` |
| nonces distincts (`verifier_receipt_nonces`) | `2` |
| statut du run après dispatch | `awaiting_approval` |

Aucune fixture n'a été utilisée pour l'attestation : le worker enfant a exécuté la procédure bornée `subset_sum` et l'attestation a été persistée par le runtime.

## 4. Dossier de preuve et rejeu causal

Un reçu de rejeu causal vérifié a été produit pour le run (`replayHistory` : racine + append + replay).  
Le dossier a été ouvert avec une réclamation unique (`claim-quality`) et scellé selon les cas ci-dessous.

## 5. Cas exécutés

### 5.1 Cas valide

| Élément | Résultat |
|---|---|
| Deux preuves indépendantes (`verifier-a`, `verifier-b`) | OK |
| Falsification survivante (`red-team`) | OK |
| Disposition au scellement | `promote` |
| `promotionEligible` | `true` |
| `assertRequired` (contrat `require_evidence_dossier_v2`) | reçu accepté, hash cohérent |
| Immuabilité du dossier scellé | `UPDATE` rejeté (`sealed promotion evidence dossier is immutable`) |
| `approveRun` | `completed` |
| Rejouabilité de `approveRun` | `completed` (idempotent, sans consommation de nonces supplémentaires) |
| Durée du cas | `967 ms` |

### 5.2 Cas invalides

| ID | Cas | Disposition observée | Blocage attendu | Résultat | Durée (ms) |
|---|---|---|---|---|---:|
| (i) | Une seule preuve | `escalate` | `PROMOTION_EVIDENCE_ESCALATE` | bloqué | 549 |
| (ii) | Contre-exemple réfuté | `reject` | `PROMOTION_EVIDENCE_REJECT` | bloqué | 1236 |
| (iii) | Altération de condensat (hash forgé) | `quarantine` | hash-mismatch | bloqué | 676 |
| (iv) | Absence de dossier (contrat `require_evidence_dossier_v2`) | n/a | `PROMOTION_EVIDENCE_DOSSIER_REQUIRED` | bloqué | ~0 |
| (v) | Dossier d'un autre run | n/a (scellé `promote` côté autre run) | refus par portée (`PROMOTION_EVIDENCE_SCOPE_MISMATCH` au niveau `assertRequired`) | bloqué | 531 |

Aucun cas invalide n'a été accepté.

## 6. Compteurs mesurés

| Compteur | Valeur |
|---|---:|
| Cas valides exécutés | `1` |
| Faux rejets (cas valides rejetés) | `0` |
| Cas invalides exécutés | `5` |
| Faux acceptations (cas invalides acceptés) | `0` |

## 7. Coûts

| Ressource | Valeur |
|---|---:|
| Jetons modèle (`modelTokens`) | `0` |
| Processus natifs (`processes`) | `2` |
| Coût calcul local (`localComputeUsd`) | `null` (non facturé / non mesuré) |
| Jetons fournisseur (`providerUsd`) | `0` |

## 8. C4 — effet métier post-application

**C4 est explicitement non mesuré dans cette campagne.**

Conformément aux rapports A4/A5 déjà produits, aucun hook de mesure d'effet métier post-application (métrique d'effet, horizon, environnement) n'est câblé à `approveRun` pour ce parcours. Le statut C4 reste donc `unmeasured` et aucune extrapolation depuis C2 n'est revendiquée.

## 9. Maillons et limites observés

- Le scénario combiné n'a subi aucun blocage fonctionnel : tous les cas attendus ont produit le verdict attendu.
- Pour que `approveRun` applique réellement la barrière du dossier, le contrat de stratégie a dû être marqué `promotion.require_evidence_dossier_v2 = true` dans le script de campagne (le contrat généré par défaut ne contient pas ce drapeau). C'est un constat de produit déjà documenté comme maillon non câblé (`couplage contrat → dossier obligatoire`), pas un échec de la campagne.
- Le dossier d'un autre run a été exercé via un second run natif distinct (branche et snapshots causal isolés par `runId`) pour éviter les collisions d'identifiants globaux.
- Les messages tardifs `SQLITE_MISUSE: Database is closed` proviennent de télémétrie asynchrone après fermeture du handle ; ils n'ont pas fait échouer le scénario.

## 10. Conclusion

La campagne réelle Phase 1 atteint, pour le parcours natif direct, les compteurs attendus : **0 faux acceptation sur 5 cas invalides** et **0 faux rejet sur 1 cas valide**, avec attestation native réelle (`processes=2`, `modelTokens=0`), dossier scellé `promote`, immuabilité vérifiée et `approveRun → completed`. Le niveau C4 (effet métier post-application) reste non mesuré et est documenté comme tel.