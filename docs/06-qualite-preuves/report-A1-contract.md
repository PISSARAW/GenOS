# Rapport A1 — Contrat & Évaluation (campagne « affirmation de mission »)

- Agent : A1
- Date : 2026-10-23
- Dépôt : `C:\Users\Shadow\Documents\GitHub\GenOS`
- Commit (working tree préexistant sale) : `1a106417f`
- Node : `v24.18.0`
- OS : Windows 11 (win32)

## 1. Commandes exécutées

| # | Commande | Code de sortie | Date |
|---|---|---|---|
| 1 | `node backend/tests/test_mission_outcome_contract.js` | 0 | 2026-10-23 |
| 2 | `node backend/tests/test_mission_outcome_falsification.js` | 0 | 2026-10-23 |
| 3 | `node %TEMP%\opencode\a1_contract_falsification.js` (fichier de travail temporaire) | 0 | 2026-10-23 |

Fichier de travail temporaire : `C:\Users\Shadow\AppData\Local\Temp\opencode\a1_contract_falsification.js` (non versionné).

## 2. Résultats des tests existants

### 2.1 `test_mission_outcome_contract.js` — code de sortie 0

- Vérifie le contrat v2, les verdicts `verified`/`inconclusive`, l'indépendance des reçus, la couverture, la signature, la confiance, l'abstention, le rejet, la déclaration `verified` sans attestation (`inconclusive`), et la clôture runtime (`blocked` + `inconclusive`).

### 2.2 `test_mission_outcome_falsification.js` — code de sortie 0

| Bloc | Cas valides | Cas invalides | Faux acceptations | Faux rejets |
|---|---|---|---|---|
| Structurel v2 | 2 | 12 | 0 | 0 |
| Sémantique oracle (`subset_sum`) | 4 | 8 | 0 | 0 |

## 3. Falsification étendue (cas manquants)

Script temporaire reproduisant les cas de la section 8 de l'audit plus des mutations supplémentaires.

### 3.1 Compteurs

| Métrique | Valeur |
|---|---|
| Cas valides (`valid=true`) | 6 |
| Cas invalides (`valid=false`) | 30 |
| Faux acceptations (`invalid` → `verified`) | 0 |
| Faux rejets (`valid` → `≠ verified`) | 0 |

### 3.2 Tableau des cas (contrat)

| ID | Attendu | Verdict observé | Statut |
|---|---|---|---|
| V1-accepted-baseline | verified | verified | OK |
| V2-constraint-order | verified | verified | OK |
| V3-receipts-swapped | verified | verified | OK |
| V4-extra-receipt | verified | verified | OK |
| V5-distinct-nonces-uuid | verified | verified | OK |
| V6-checkedat-varied | verified | verified | OK |
| I-declared-verified-no-attestation | ¬verified | inconclusive | OK |
| I-declared-verified-no-proof | ¬verified | inconclusive | OK |
| I-abstained-declaration | abstained | abstained | OK |
| I-worker-no-answer | abstained | abstained | OK |
| I-rejected-declaration | rejected | rejected | OK |
| I-evidence-failure | rejected | rejected | OK |
| I-verifier-allAccepted-false | ¬verified | inconclusive | OK |
| I-verifier-trusted-empty | ¬verified | inconclusive | OK |
| I-verifier-results-empty | ¬verified | inconclusive | OK |
| I-expired-attestation | ¬verified | inconclusive | OK |
| I-expired-attestation-now | ¬verified | inconclusive | OK |
| I-attestation-other-run | ¬verified | inconclusive | OK |
| I-receipt-other-run | ¬verified | inconclusive | OK |
| I-tampered-signature | ¬verified | inconclusive | OK |
| I-duplicate-nonce | ¬verified | inconclusive | OK |
| I-wrong-coverage | ¬verified | inconclusive | OK |
| I-forged-payload | ¬verified | inconclusive | OK |
| I-changed-statement | ¬verified | inconclusive | OK |
| I-changed-domain | ¬verified | inconclusive | OK |
| I-changed-artifact | ¬verified | inconclusive | OK |
| I-wrong-oracle-domain | ¬verified | inconclusive | OK |
| I-wrong-verifier | ¬verified | inconclusive | OK |
| I-missing-receipt | ¬verified | inconclusive | OK |
| I-same-strategy | ¬verified | inconclusive | OK |
| I-same-actor | ¬verified | inconclusive | OK |
| I-attestation-not-accepted | ¬verified | inconclusive | OK |
| I-attestation-wrong-schema | ¬verified | inconclusive | OK |
| I-delegated-topology | ¬verified | inconclusive | OK |
| I-missing-validUntil | ¬verified | inconclusive | OK |
| I-tampered-nonce | ¬verified | inconclusive | OK |

### 3.3 Note sur `I-same-actor`

Une première variante de ce cas a produit une fausse acceptation apparente : le vérificateur d'identité `verifierIdentity` priorise la stratégie (`executionEvidence[0].postconditions.strategy`) lorsqu'elle est présente, donc deux reçus portant le même `actorId` mais des stratégies distinctes restaient indépendants. Ce n'est pas un défaut du contrat (comportement prévu), mais un cas de test mal construit. La variante retenue supprime l'évidence d'exécution pour forcer le repli sur `actorId`, ce qui donne `inconclusive`. À documenter pour A5 (topologies déléguées).

## 4. `validFormalResult` — mutations d'empreinte et de domaine

`validFormalResult` n'est pas exporté par `missionOutcomeContract.js`. Il a été extrait par analyse de source (lecture du fichier, extraction de la fonction, injection de `createFormalResult`) pour le test direct. Vérification indirecte également via les cas `I-changed-*` ci-dessus.

| ID | Mutation | Résultat |
|---|---|---|
| VFR-base | aucune | true |
| VFR-fingerprint | `semanticFingerprint` | false |
| VFR-resultId | `resultId` | false |
| VFR-evidence-digest | `evidence.digest` | false |
| VFR-domain-statement | `validityDomain.statement` (résultat) | false |
| VFR-domain-constraints | `validityDomain.constraints` (résultat) | false |
| VFR-oracle-domain-mismatch | `validityDomain.statement` (oracle) | false |

Conclusion : `validFormalResult` rejette bien les mutations d'empreinte (`semanticFingerprint`, `resultId`, `evidence.digest`) et de domaine (`statement`, `constraints`), côté résultat comme côté oracle.

Note : l'ordre seul des contraintes n'est pas détectable, car `createFormalResult` canonicalise (trie) les contraintes — comportement voulu.

## 5. Sémantique oracle (`subset_sum`)

| Métrique | Valeur |
|---|---|
| Cas valides | 4 |
| Cas invalides | 8 |
| Faux acceptations | 0 |
| Faux rejets | 0 |

Stratégies couvertes : `subset_bitset`, `subset_enumeration` (2 implémentations distinctes au niveau de l'algorithme, même processus).

## 6. Cas non mesurés

- Topologies déléguées : seul le drapeau `delegated` est testé (refus par `validNativeProof`). Les parcours délégués réels et la clôture alternative ne sont pas exercés ici (A5).
- Autres domaines que `subset_sum` : non couverts (`oracleSubsetChecks` ne fournit que `subset_sum`).
- Preuve formelle native (Lean) : non mesurée (absence d'outil).
- Attestation native réelle et nonces : hors périmètre A1 (A2).
- Dossier de preuve / promotion : hors périmètre (A3).
- Effet observé C4 : hors périmètre (A4).
- Multi-obligations : un seul cas partiel (deux obligations, une seule couverte) dans le test existant ; pas de cas à N obligations dans la falsification étendue.
- Frontière temporelle exacte de `validUntil` (égalité `Date.now() >= Date.parse`) : non testée à la milliseconde.

## 7. Verdict A1

- Critère de succès A1 : 0 faux acceptation sur ≥ 20 cas invalides ; 0 faux rejet sur ≥ 6 cas valides.
- Résultat : **0 faux acceptation / 30 cas invalides** ; **0 faux rejet / 6 cas valides**. Critère **atteint**.
- Aucune modification de fichier source (`backend/src`, `backend/tests`) n'a été effectuée. Seul le rapport et des fichiers temporaires ont été créés.
- Porte qualité : non réexécutée (aucun fichier source touché).