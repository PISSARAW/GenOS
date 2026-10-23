# Rapport A2 — Oracle natif & attestation (campagne « affirmation de mission »)

- Agent : A2
- Date : 2026-10-23
- Dépôt : `C:\Users\Shadow\Documents\GitHub\GenOS`
- Commit (working tree préexistant sale) : `1a106417f`
- Node : `v24.18.0`
- OS : Windows 11 (win32)
- Aucun fichier source modifié. Exécution dans un répertoire temporaire (`GENOS_DB_PATH` posé par le test lui-même).

## 1. Commandes exécutées

| # | Commande | Code de sortie | Date |
|---|---|---|---|
| 1 | `node backend/tests/test_native_oracle_completion.js` | 0 | 2026-10-23 |
| 2 | `node C:\Users\Shadow\AppData\Local\Temp\opencode\a2-inspect.js` (travail temporaire) | 0 | 2026-10-23 |
| 3 | `node C:\Users\Shadow\AppData\Local\Temp\opencode\a2-replay.js` (travail temporaire) | 0 (throw attendu) | 2026-10-23 |
| 4 | `python scripts/ci/check_code_quality.py` | 1 (baseline préexistant) | 2026-10-23 |

Fichiers de travail temporaires : `C:\Users\Shadow\AppData\Local\Temp\opencode\a2-inspect.js`, `a2-replay.js` (non versionnés, hors dépôt).

## 2. Résultat du test principal

`test_native_oracle_completion.js` — code de sortie **0**, durée murale **53 786 ms** (~53,8 s).

Assertions vérifiées par le test (extrait) :

- `result.success === true`, statut de run ∈ {`completed`, `awaiting_approval`} (observé `completed`).
- Attestation native : `accepted === true`.
- `costs.processes === 2`.
- `costs.modelTokens === 0`.
- `costs.localComputeUsd === null`.
- Ligne d'acceptation présente dans le journal (`accepted.value.status === row.status`).
- `nonces.length === 2`.
- Reproduction idempotente : `prepare` une seconde fois renvoie `{eventId, hash}` identique.
- Non-consommation de nonces lors de la reproduction (compteur reste à 2).
- Reçu biologique : `receipt.result.verified === true`, `budgetAssessment.satisfied === true`.
- Evidence signée liée au run et au tenant (`outcomeEvidence.validate(...) === true`), statut `verified`.
- Probes complémentaires (références, réservation, budgets, mémoire, promotion) passent.

## 3. Attestation native acceptée (persistée)

Run observé (inspection) :

- `runId` : `strategy_run_1792733879444_90c95b12`
- statut : `completed`
- `attestation.eventId` : `gvx-run:strategy_run_1792733879444_90c95b12:native-oracle-attestation`
- `attestation.hash` : `80e030a6003a6d5b065f85afb2031e07ddd51c8871eafbc595b3db05c7b59991`

Coûts réels (attestation.value.costs) :

| Champ | Valeur |
|---|---|
| `processes` | 2 |
| `modelTokens` | 0 |
| `runtimeMs` | 461 |
| `observedProcesses` | 2 |
| `observedRuntimeMs` | 461 |
| `reservedExecutions` | 2 |
| `unresolvedExecutions` | 0 |
| `complete` | true |
| `localComputeUsd` | null |
| `providerUsd` | 0 |

Domaine : `subset_sum`. `validUntil` : `2026-10-23T05:39:00.676Z`. `completedAt` : `2026-10-23T05:38:02.626Z`. `accepted` : `true`.

## 4. Acceptation persistée (journal)

- `acceptance.eventId` : `gvx-run:strategy_run_1792733879444_90c95b12:native-oracle-acceptance`
- `acceptance.hash` : `885e04d92d99a7df80d890d066463dc5abc4966e8d5e87d38a360ebb26d624fe`
- `acceptance.value.schema` : `genos.native-oracle-acceptance/v1`
- `acceptance.value.status` : `completed` (égal au statut du run)
- `acceptance.value.attestationHash` : `80e030a6003a6d5b065f85afb2031e07ddd51c8871eafbc595b3db05c7b59991`
- `acceptance.value.decidedAt` : `2026-10-23T05:38:02.880Z`
- `acceptance.value.nonces` : `["8764805f-d29b-4fc3-ad48-6c7f560c20ac", "54523d86-e5f5-4b65-9505-db78d7de3a3f"]`

Nonces revendiqués dans `verifier_receipt_nonces` : **2 lignes**, valeurs identiques aux deux ci-dessus (distinctes).

Code source : `nativeOracleGate.accept` (l. 27-44) ajoute l'événement `kind: 'acceptance'` via `journal.append` (l. 39-43) après avoir revendiqué les nonces via `strategyPromotionPolicyService.claimVerifierNonce` (l. 34-37).

## 5. Reproduction (idempotence)

Appel de `nativeOracleCoordinator.prepare(db, request)` une seconde fois :

- Résultat : `{eventId: "gvx-run:...:native-oracle-attestation", hash: "80e030a6..."}` — **identique** à l'attestation initiale.
- Compteur de nonces avant/après : **2 → 2** (aucune consommation).

Mécanisme : `nativeOracleCoordinator.prepare` (l. 11-25) — si la réservation existe déjà (`allocation.owned === false`), lit l'attestation antérieure et la renvoie sans ré-exécuter l'oracle (`l. 17-22`). Aucun nouveau nonce n'est généré.

## 6. Expiration (refus)

Condition de refus documentée dans le code :

- `nativeOracleProof.assertCurrent` l. 64 : `if (Date.now() >= Date.parse(proof.attestation.value.validUntil)) throw values.failure('ORACLE_ATTESTATION_EXPIRED')`.
- `missionOutcomeContract.validNativeProof` l. 133-134 : `!Number.isFinite(Date.parse(attestation.validUntil)) || Date.now() >= Date.parse(attestation.validUntil)` → retourne `false` (non exportée ; condition citée).
- `nativeOracleCoordinator.execute` l. 50 : `if (Date.now() > Date.parse(allocation.value.expiresAt)) throw values.failure('ORACLE_BUDGET_EXPIRED')`.

Preuve comportementale : `nativeCompletionProbes.expiredView` force `Date.now` à `validUntil + 1 ms` et vérifie :

- `proofs.assertCurrent` rejette (code `EXECUTION_AUTHORITY_EXPIRED`, l'autorité expirant en premier) ;
- `proofs.assertCompletedEvidence` ne rejette pas (décision historique conservée) ;
- `nativeOracleInspection.inspect(...).current.satisfied === false` (preuve courante non satisfaite) ;
- `gate.historical(...).acceptance.value.status === 'completed'` (décision historique conservée).

Ainsi une preuve dont `validUntil` est dépassé est refusée pour toute décision courante, mais la décision historique reste consultable.

## 7. Rejeu de nonce (refus)

Condition de refus :

- `nativeOracleGate.assertNoncesUnused` l. 20-24 : pour chaque reçu, si `SELECT nonce FROM verifier_receipt_nonces WHERE nonce=?` renvoie une ligne → `throw values.failure('receipt_replay')`.
- `strategyPromotionPolicyService.claimVerifierNonce` l. 255 : si `INSERT OR IGNORE` affecte 0 ligne → `replayRefused()` (policy `receipt_replay`).

Preuve comportementale : `nativeCompletionProbes.qualify` l. 24 appelle `gate.context(db, { row, event: terminal.event })` après consommation des nonces et attend un rejet `{ code: 'receipt_replay' }`. Le test principal (code de sortie 0) exerce ce chemin avec succès.

## 8. Porte qualité

`python scripts/ci/check_code_quality.py` — code de sortie **1**, 45 violations (44 nouvelles) rapportées sur le dépôt. Aucun fichier source n'a été modifié par A2 ; les violations sont préexistantes au baseline (`scripts/ci/quality_baseline.json`) et ne résultent pas de cette tâche. Le gate n'a pas été modifié.

## 9. Critère de succès A2

| Critère | Résultat |
|---|---|
| Attestation acceptée avec `processes ≥ 2` | Oui (2) |
| `modelTokens === 0` | Oui (0) |
| 2 nonces distincts | Oui |
| Reproduction idempotente | Oui |
| Refus des cas invalides (rejeu, expiration) | Oui |

Verdict A2 : **PASS** pour l'oracle natif et son attestation, avec preuve réelle persistée, coûts mesurés et refus des cas invalides documentés.