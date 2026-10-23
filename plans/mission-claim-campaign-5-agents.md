# Plan — Campagne « affirmation de mission » (mission claim) sur 5 agents

Date : 2026-10-23. Statut : plan d'exécution (lecture seule pour l'audit ; exécution des tests dans un environnement isolé pour la campagne). Aucun fichier source n'est modifié par ce plan ; il produit des artefacts de preuve et, le cas échéant, des propositions de correctifs.

## 0. Objectif

Démontrer (ou réfuter) que la capacité « affirmation de mission » est opérationnelle en situation réelle de bout en bout, selon la chaîne de preuves définie dans `docs/06-qualite-preuves/qualification-issue-mission.md` et l'ADR 0613 :

```
contrat v2 figé → exécution réelle → attestation native acceptée (persistée)
→ deux reçus indépendants (implémentations distinctes, nonces revendiqués)
→ reconstruction formelle + comparaison de domaine
→ dossier scellé disposition=promote
→ approveRun consomme le dossier (assertRequired)
→ promotion réelle (journal + recovery)
→ effet métier observé après application (C4)
→ invalidation des preuves périmées
```

Livrable final : un rapport chiffré (`false_accepts`, `false_rejects`, couverture, coûts, durées) + verdict de maturité, déposé dans `docs/06-qualite-preuves/receipts/`.

## 1. Contraintes et règles

- Ne pas modifier les sources existantes pendant la campagne ; si un défaut est trouvé, l'agent le consigne dans un fichier `findings-*.md` et ne patche pas.
- Exécuter les tests dans un répertoire temporaire (`os.tmpdir()`), jamais sur `genos.db` de la racine.
- Variables d'environnement obligatoires par run : `GENOS_DB_PATH`, `GENOS_STUDIO_ROOT`, `GENOS_CAPSULE_ROOT`, `GENOS_WORKSPACES_ROOT`, `GENOS_EPISTEMIC_RECEIPT_SECRET`, `GENOS_DISABLE_DOTENV=1`, `GENOS_DB_BACKUP_SKIP=1`.
- Respecter la porte qualité : `python scripts/ci/check_code_quality.py` (0 nouvelle violation) et `cargo test --workspace` si touché.
- Conventions de commit : tag entre crochets majuscule si un commit est finalement produit.
- Aucune action sur service/compte/projet externe.

## 2. Architecture des 5 agents

| Agent | Rôle | Sortie principale | Dépend de |
|---|---|---|---|
| A1 — Contrat & Évaluation | Falsification structurelle et sémantique du contrat v2 | `report-A1-contract.md` | — |
| A2 — Oracle natif & attestation | Preuve réelle de l'oracle natif, nonces, reproduction | `report-A2-native-oracle.md` | — |
| A3 — Dossier de preuve & promotion | Dossier scellé, `approveRun`, immuabilité, recovery | `report-A3-dossier-promotion.md` | A2 |
| A4 — Effet observé & C4 | Mesure différée, invalidation des preuves périmées | `report-A4-effect.md` | A1, A3 |
| A5 — Indépendance & intégration | Deux vérificateurs distincts, topologies, rapport final | `report-A5-integration.md` | A1-A4 |

A1 et A2 peuvent démarrer en parallèle. A3 dépend de A2 (attestation native réelle). A4 dépend de A1 et A3. A5 est le dernier (synthèse).

## 3. Fichiers de référence (lecture)

- `backend/src/services/missionOutcomeContract.js` (l. 1-177)
- `backend/src/services/promotionEvidenceDossierService.js` (l. 1-253)
- `backend/src/services/epistemic/nativeOracleGate.js` (l. 1-109)
- `backend/src/services/strategyExecutionService.js` (l. 222-258)
- `backend/src/services/strategyExecutionProgress.js` (l. 1-336)
- `backend/src/services/formalResultService.js`
- `backend/src/services/epistemic/epistemicVerifierReceiptService.js`
- `backend/src/services/epistemic/oracleSubsetChecks.js`
- `backend/tests/test_mission_outcome_contract.js`
- `backend/tests/test_mission_outcome_falsification.js`
- `backend/tests/test_promotion_evidence_dossier.js`
- `backend/tests/test_native_oracle_completion.js`
- `backend/tests/helpers/nativeCompletionProbes.js`, `nativeOracleReservationProbes.js`, `nativeOracleBudgetProbes.js`
- `docs/06-qualite-preuves/qualification-issue-mission.md`
- `docs/adr/0441-oracle-borne-issue-mission.md`, `docs/adr/0613-dossier-preuve-falsifiable-avant-promotion.md`

## 4. Tâches par agent

### A1 — Contrat & Évaluation

Objectif : reproduire et étendre la falsification structurelle/sémantique du contrat v2, en ajoutant les cas non couverts (déclaration `verified` sans attestation, abstention, rejet, échec vérificateur, preuve périmée).

Tâches :
1. Lire `test_mission_outcome_contract.js` et `test_mission_outcome_falsification.js` ; exécuter chacun isolément sous Node 22 et consigner code de sortie + digest de sortie.
2. Ajouter (dans un fichier de travail temporaire, jamais dans `backend/tests/`) les cas manquants listés section 8 de l'audit :
   - déclaration `verified` sans attestation → `inconclusive` ;
   - abstention / rejet / échec vérificateur ;
   - preuve périmée (`validUntil` passé) ;
   - attestation liée à un autre run ;
   - reçu modifié (signature, nonce, couverture).
3. Mesurer `false_accepts / invalid_cases` et `false_rejects / valid_cases`.
4. Vérifier que `validFormalResult` (l. 115-126) rejette bien les mutations d'empreinte et de domaine.
5. Consigner les cas non mesurés (topologies déléguées, autres domaines que `subset_sum`).

Livrable : `report-A1-contract.md` avec tableau des cas, compteurs, commandes, versions Node, date.

Critère de succès A1 : 0 faux acceptation sur ≥ 20 cas invalides ; 0 faux rejet sur ≥ 6 cas valides.

### A2 — Oracle natif & attestation

Objectif : produire la preuve réelle la plus forte pour l'oracle natif et son attestation, en réutilisant `test_native_oracle_completion.js`.

Tâches :
1. Exécuter `test_native_oracle_completion.js` isolément sous Node 22 ; consigner code de sortie, `costs.processes`, `costs.modelTokens`, nombre de nonces.
2. Vérifier la reproduction : appeler `nativeOracleCoordinator.prepare` une seconde fois et confirmer `{eventId, hash}` identique et non-consommation de nonces.
3. Vérifier `nativeOracleGate.accept` : présence d'une ligne `acceptance` dans le journal, nonces revendiqués dans `verifier_receipt_nonces`.
4. Tester l'expiration : forcer `validUntil` passé et confirmer le refus (`validNativeProof` l. 133-134).
5. Tester le rejeu de nonce : réutiliser un nonce déjà revendiqué → refus `receipt_replay` (nativeOracleGate l. 20-24).
6. Documenter les coûts et durées réels.

Livrable : `report-A2-native-oracle.md`.

Critère de succès A2 : attestation acceptée avec `processes ≥ 2`, `modelTokens === 0`, 2 nonces distincts, reproduction idempotente, refus des cas invalides.

### A3 — Dossier de preuve & promotion

Objectif : exercer le dossier de preuve avec une attestation native réelle (pas des fixtures) et le consommer dans `approveRun`.

Tâches :
1. Exécuter `test_promotion_evidence_dossier.js` isolément ; consigner code de sortie.
2. Construire un scénario combiné (fichier de travail temporaire) :
   - lancer le worker natif de A2 pour obtenir une attestation réelle ;
   - ouvrir un dossier (`dossiers.open`) lié au run et au reçu de rejeu causal ;
   - ajouter deux preuves indépendantes issues de deux vérificateurs réels (pas le même code) ;
   - ajouter une falsification survivante ;
   - sceller et vérifier `disposition === 'promote'`, `authorizesPromotion === false`, `requiresExistingPromotionGate === true` ;
   - appeler `approveRun` avec `promotionDossierId` et vérifier `status === 'completed'`.
3. Tester les dispositions `reject`, `quarantine`, `escalate` avec des données réelles.
4. Tester l'immutabilité (UPDATE/DELETE sur dossier scellé → erreur).
5. Tester la reprise (`promotionExecutionRecovery`) après interruption.
6. Tester l'absence de dossier quand le contrat l'exige → `PROMOTION_EVIDENCE_DOSSIER_REQUIRED`.

Livrable : `report-A3-dossier-promotion.md`.

Critère de succès A3 : promotion complète avec dossier `promote` ; blocage pour `reject`/`quarantine`/`escalate`/absent ; immuabilité vérifiée ; reprise sans double consommation.

### A4 — Effet observé & C4

Objectif : instrumenter l'observation différée de l'effet métier et l'invalidation des preuves périmées.

Tâches :
1. Définir, pour la mission bornée de A2/A3, une métrique métier observable après application (ex. score de qualité du worker) avec horizon et environnement déclarés.
2. Observer cette métrique après `approveRun` et comparer au verdict `verified`.
3. Forcer une preuve périmée (changement de dépendance/version d'oracle) et vérifier qu'elle est invalidée (pas réutilisée).
4. Documenter les cas où le verdict `verified` ne correspond pas à l'effet observé (faux positif C4).
5. Consigner les cas non mesurés et les limites de l'horizon.

Livrable : `report-A4-effect.md`.

Critère de succès A4 : au moins un cas où l'effet est observé et documenté ; au moins un cas de preuve périmée invalidée ; 0 faux positif C4 non expliqué.

### A5 — Indépendance & intégration

Objectif : valider l'indépendance réelle (deux vérificateurs à code distinct) et produire le rapport final.

Tâches :
1. Faire exécuter l'oracle par deux implémentations distinctes (ex. `subset_bitset` et `subset_enumeration` déjà présents dans `oracleSubsetChecks`) dans deux processus séparés avec des `actorId` distincts.
2. Vérifier que `hasIndependentQuorum` exige bien deux identités distinctes (test `sameActor` déjà présent) et que deux processus au même code sont rejetés comme indépendance insuffisante.
3. Tester les topologies déléguées et les parcours de clôture autres que le natif direct.
4. Synthétiser les rapports A1-A4 dans `report-A5-integration.md` + `mission-claim-campaign-result.json` (compteurs, coûts, durées, versions, commit).
5. Appliquer la porte qualité et consigner le résultat.

Livrable : `report-A5-integration.md` + `mission-claim-campaign-result.json` dans `docs/06-qualite-preuves/receipts/`.

Critère de succès A5 : rapport final avec 0 fausse acceptation, 0 fausse rejection inexpliquée, verdict de maturité tranché (opérationnel ou non), et chaîne de preuves complète ou liste explicite des maillons manquants.

## 5. Séquencement

```
J0 : A1 ∥ A2  (parallèle)
J1 : A3 (dépend A2)
J2 : A4 (dépend A1, A3)
J3 : A5 (synthèse)
```

Chaque agent produit son rapport dans `docs/06-qualite-preuves/` avec le nom `report-Ax-*.md`. Aucun agent ne modifie les sources.

## 6. Critères globaux de la campagne

- `false_accepts / invalid_cases = 0`
- `false_rejects / valid_cases = 0`
- couverture des obligations requises = 100 %
- `approveRun` bloque sans dossier quand requis, réussit avec dossier `promote`
- immuabilité vérifiée
- reprise sans double consommation de nonces
- effet C4 observé et documenté (ou explicitement `unknown` avec justification)
- aucun `skipped`/`unmeasured`/`inconclusive` compté comme PASS
- porte qualité verte (0 nouvelle violation)

## 7. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Tests intermittents (`SQLITE_BUSY`, budget oracle) | Relancer séquentiellement ; utiliser des DB isolées ; documenter les échecs |
| Absence de Lean pour le test formel natif | Documenter comme non mesuré, pas comme PASS |
| Dépendance à des fixtures | A2/A3 doivent utiliser le worker natif réel, pas `issueReceipt` seul |
| Mélange de topologies | A5 isole les parcours délégués et les marque séparément |
| Dérive de la doc | Confronter chaque affirmation au code (chemins + lignes) dans les rapports |

## 8. Commandes de vérification

```bash
node backend/tests/test_mission_outcome_contract.js
node backend/tests/test_mission_outcome_falsification.js
node backend/tests/test_promotion_evidence_dossier.js
node backend/tests/test_native_oracle_completion.js
python scripts/ci/check_code_quality.py
cargo test --workspace
```

Chaque commande doit être consignée avec son code de sortie et sa date dans le rapport de l'agent concerné.

## 9. Livrables attendus

- `docs/06-qualite-preuves/report-A1-contract.md`
- `docs/06-qualite-preuves/report-A2-native-oracle.md`
- `docs/06-qualite-preuves/report-A3-dossier-promotion.md`
- `docs/06-qualite-preuves/report-A4-effect.md`
- `docs/06-qualite-preuves/report-A5-integration.md`
- `docs/06-qualite-preuves/receipts/mission-claim-campaign-result.json`

Si les éléments ne permettent pas de conclure à l'issue de la campagne, le dire explicitement dans `report-A5-integration.md` et ne pas promouvoir la capacité.
