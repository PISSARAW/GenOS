# Rapport A5 — Indépendance & Intégration (campagne « affirmation de mission »)

- Agent : A5
- Date : 2026-10-23
- Dépôt : `C:\Users\Shadow\Documents\GitHub\GenOS`
- Commit (HEAD) : `ee5ba4b03347bbf3534e8f55322859b4ee360eae`
- Node : `v24.18.0`
- OS : Windows 11 (win32)
- Aucun fichier source modifié. Aucune action externe.

## 1. Commandes exécutées

| # | Commande | Code de sortie | Date |
|---|---|---|---|
| 1 | `node backend/tests/test_mission_outcome_contract.js` | 0 | 2026-10-23 |
| 2 | `node backend/tests/test_concept_control_extensions.js` | 0 | 2026-10-23 |
| 3 | `python scripts/ci/check_code_quality.py` | 1 (45 violations, 44 nouvelles) | 2026-10-23 |

Lectures : `report-A1-contract.md`, `report-A2-native-oracle.md`, `report-A3-dossier-promotion.md`, `report-A4-effect.md`, plus les sources `missionOutcomeContract.js`, `nativeOracleGate.js`, `delegatedNativeOracleGate.js`, `missionActionRuntimeService.js`, `oracleSubsetChecks.js`, `strategyExecutionProgress.js`.

## 2. Synthèse des rapports A1–A4

| Agent | Résultat principal | Faux acceptations | Faux rejets | Couverture | Coûts | Durées |
|---|---|---|---|---|---|---|
| A1 — Contrat & Évaluation | Critère atteint | 0 / 30 invalides | 0 / 6 valides | Contrat v2 structure (2 valides / 12 invalides) + sémantique `subset_sum` (4 / 8) + `validFormalResult` | Aucun (calcul local) | Tests < 1 s |
| A2 — Oracle natif & attestation | PASS | Refus expiration + rejeu de nonce | 0 (reproduction idempotente) | Attestation native acceptée, persistée, 2 nonces distincts | `processes=2`, `modelTokens=0`, `runtimeMs=461`, `providerUsd=0` | ~53,8 s (`test_native_oracle_completion.js`) |
| A3 — Dossier & promotion | PASS (parcours exercé) | Blocage reject/quarantine/escalate/absent | 0 | Dossier `promote` → `approveRun` → `completed`, immuabilité UPDATE+DELETE, reprise idempotente | `processes=2`, `modelTokens=0`, 2 nonces | 2,5 s + 12,9 s + 2,5 s |
| A4 — Effet & C4 | Non atteint (C4 non mesuré) | 0 faux positif C4 observé (aucun effet observé) | n/a | Expiration temporelle + altération empreinte/domaine testées ; changement de version d'oracle code only | Aucun | Tests existants |
| A5 — Indépendance & intégration | Voir verdict § 6 | 0 | 0 | Voir § 3 et § 4 | Aucun nouveau | Tests < 1 s + porte qualité |

## 3. Validation de l'indépendance réelle

### 3.1 `hasIndependentQuorum` (`missionOutcomeContract.js`, l. 98-102)

```js
function hasIndependentQuorum(result, receipts, trusted) {
  const matching = receipts.filter((receipt) => acceptedReceipt(receipt, result, trusted));
  return new Set(matching.map((receipt) => receipt.nonce)).size >= 2
    && new Set(matching.map(verifierIdentity)).size >= 2;
}
```

Exigences effectives :
- au moins **2 nonces distincts** ;
- au moins **2 identités de vérificateur distinctes** (via `verifierIdentity`).

### 3.2 `verifierIdentity` (`missionOutcomeContract.js`, l. 91-96)

```js
function verifierIdentity(receipt) {
  const strategy = receipt.executionEvidence?.[0]?.postconditions?.strategy;
  if (strategy) return `strategy:${strategy}`;
  const actor = receipt.independenceDescriptor?.actorId;
  return actor ? `actor:${actor}` : `verifier:${receipt.verifierDigest}`;
}
```

Point d'attention (documenté par A1) : la stratégie est **prioritaire** sur l'`actorId`. Deux reçus portant le même `actorId` mais des stratégies distinctes restent indépendants (`strategy:…` distincts). Ce n'est pas un défaut du contrat (comportement prévu), mais la construction des cas de test doit en tenir compte. La variante retenue par A1 supprime l'évidence d'exécution pour forcer le repli sur `actorId`, ce qui donne bien `inconclusive`.

### 3.3 Cas `sameActor` (`test_mission_outcome_contract.js`, l. 46-51)

Le test modifie le second reçu pour porter le même `actorId` (`verifier-first`) que le premier (en supprimant la stratégie pour forcer le repli), et attend `inconclusive`. Le test passe (code de sortie 0, confirmé le 2026-10-23). **Conclusion : deux processus au même code avec le même `actorId` sont rejetés comme indépendance insuffisante.**

### 3.4 Deux implémentations distinctes (`subset_bitset` et `subset_enumeration`)

- `oracleSubsetChecks.js` fournit bien **deux algorithmes distincts** (`bitset` et `enumeration`) pour le même domaine `subset_sum`.
- A1 a exercé les deux stratégies, mais **dans le même processus** (« 2 implémentations distinctes au niveau de l'algorithme, même processus »).
- **Non mesuré** : aucune exécution dans **deux processus séparés** avec des `actorId` distincts n'a été réalisée dans cette campagne. Le critère A5.1 (deux implémentations distinctes dans deux processus séparés) n'est donc **pas atteint** et reste marqué `unmeasured`. Par construction, `hasIndependentQuorum` exigerait deux identités distinctes ; le code le permet, mais la preuve comportementale cross-processus manque.

## 4. Topologies déléguées et parcours de clôture

### 4.1 Code analysé

- `delegatedNativeOracleGate.js` (l. 9-102) : activé par `nativeOracleGate.context` (l. 11) **lorsqu'il n'y a pas de `nativeOracleRef`** dans l'événement. Il exige :
  - un rapport délégué complet (`assertReportShape`, l. 24-29) ;
  - une autorité parente autorisée (`authority.assertRun`, l. 14-15) ;
  - des enfants dont le parent est l'agent courant, le run `completed`, le scope cohérent (l. 50-59) ;
  - une mission enfant identique à la mission parent (l. 61-65) ;
  - une acceptation native antérieure avec nonces cohérents (l. 67-78) ;
  - la conservation exacte de l'ensemble des claims par worker (l. 84-99).
- `missionOutcomeContract.validNativeProof` (l. 128-136) renvoie `false` si `verification.delegated` est vrai. **Conséquence** : un parcours délégué ne peut jamais produire un verdict `verified` au niveau `mission_outcome` via la voie native directe. La clôture déléguée est donc, par construction, non promouvable par ce contrat ; elle reste un assemblage de preuves enfants.
- `missionActionRuntimeService.js` (`run`, l. 150-168) : parcours d'action de mission (shadow/active) avec budget, décision signée, exécution réservée, observation modèle. Il ne consomme pas de dossier de preuve et ne passe pas par `nativeOracleGate`. C'est un **parcours de clôture alternatif** (action runtime) distinct de l'oracle natif.

### 4.2 Ce qui est testé

| Parcours | Statut | Evidence |
|---|---|---|
| Oracle natif direct (`nativeOracleRef` présent) | Testé bout-en-bout | `test_native_oracle_completion.js` (code 0), A2 |
| `delegatedNativeOracleGate.assertClaims` (cohérence des claims par worker) | Testé unitairement | `test_concept_control_extensions.js` (l. 76-78), code 0 |
| `delegatedNativeOracleGate.context` (flux DB complet : autorité parent, enfants, acceptation, nonces) | **Non testé** (aucun test n'appelle `.context` avec des refs déléguées) | grep : aucune occurrence de `delegatedNativeOracleGate.context` dans `backend/tests` |
| `missionActionRuntimeService.run` (shadow/active) | Testé | `test_mission_action_runtime.js` (non réexécuté par A5, cité) |
| Topologies rhizome (`rhizomeOracleEvidenceResolver.resolve`) | Code présent, tests partiels | `test_concept_control_extensions.js` ne couvre pas le resolver DB |

### 4.3 Verdict sur les topologies

Les topologies déléguées et la clôture alternative par action runtime **ne sont pas exercées bout-en-bout** dans cette campagne. Seuls des fragments unitaires (assertClaims) sont couverts. Le code est cohérent et fail-closed, mais l'absence de test E2E délégué est un **maillon manquant** à signaler. Aucun `skipped`/`unmeasured` n'est compté comme PASS.

## 5. Maillons manquants de la chaîne de preuves

Chaîne visée (plan §0) :

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

| Maillon | Statut | Source |
|---|---|---|
| Contrat v2 figé | Atteint (A1) | `missionOutcomeContract` v2, 0 faux acceptation / 30 invalides |
| Exécution réelle | Atteint (A2) | `test_native_oracle_completion.js` |
| Attestation native acceptée persistée | Atteint (A2) | journal `acceptance`, 2 nonces revendiqués |
| Deux reçus indépendants (nonces) | Atteint pour les nonces | `hasIndependentQuorum` exige 2 nonces distincts |
| Deux implémentations distinctes dans deux processus | **Non mesuré** | A1 : même processus ; A5 : cross-process non exercé |
| Reconstruction formelle + comparaison de domaine | Atteint | `validFormalResult` (A1 VFR-*) |
| Dossier scellé `disposition=promote` | Atteint (A3) | `test_promotion_evidence_dossier.js` + scénario combiné |
| `approveRun` consomme le dossier | **Partiel** | `assertRequired` ne consomme que si le contrat exige le dossier ; aucun contrat généré ne porte `promotion.require_evidence_dossier_v2` (A3 §9.1) |
| Promotion réelle (journal + recovery) | Atteint (A3) | `approveRun` → `completed`, reprise idempotente |
| Effet métier observé (C4) | **Non mesuré** | A4 : aucun hook, aucune métrique d'effet, aucun horizon/environnement |
| Invalidation des preuves périmées | Partiel | Expiration + empreinte/domaine testées ; changement de version d'oracle code only (A4) |
| Topologies déléguées E2E | **Non mesuré** | § 4.2 |
| Preuve formelle native (Lean) | **Non mesuré** | outil absent (A1/A2/A3) |
| Multi-obligations à N | Partiel | un cas à 2 obligations dans le test existant (A1) |
| Frontière exacte de `validUntil` | Non testée à la ms | A1/A2 |

## 6. Verdict de maturité

**La capacité « affirmation de mission » n'est PAS opérationnelle de bout en bout.**

Justification tranchée :
- Les maillons natifs directs sont solides et testés : contrat v2 (0 faux acceptation / 30 invalides, 0 faux rejet / 6 valides), oracle natif accepté avec preuve persistée (`processes=2`, `modelTokens=0`, 2 nonces distincts), dossier scellé `promote`, `approveRun` → `completed`, immuabilité, reprise idempotente.
- Mais la chaîne de preuves n'est **pas complète** : l'effet métier C4 est non mesuré, l'indépendance cross-processus n'est pas prouvée, le couplage contrat → dossier obligatoire n'est pas implémenté, les topologies déléguées ne sont pas exercées E2E, et le changement de version d'oracle n'est pas testé.
- Conformément au protocole (`qualification-issue-mission.md`) et à l'ADR 0613, aucun `skipped`/`unmeasured`/`inconclusive` n'est compté comme PASS. La capacité ne doit donc pas être promue.

Niveau atteint : **niveau C2 (preuve structurelle/sémantique + oracle natif + dossier) atteint pour le parcours natif direct** ; **niveau C4 (effet observé) non atteint** ; **indépendance réelle cross-processus non prouvée**.

## 7. Recommandations

1. **Implémenter le couplage contrat → dossier obligatoire** : faire porter `promotion.require_evidence_dossier_v2` par les contrats générés selon le profil de mission / niveau de risque (ADR à prévoir). Sans cela, `approveRun` reste optionnel en production.
2. **Prouver l'indépendance cross-processus** : exécuter `subset_bitset` et `subset_enumeration` dans deux processus distincts avec des `actorId` distincts et consigner les reçus. Ajouter un test dédié.
3. **Instrumenter C4** : ajouter des champs `effectMetric` / `horizon` / `environment` dans `mission_outcome` v2 et dans la promotion ; câbler `recordGenomicOutcome` / `cognitiveRecipeMemoryService` à `approveRun` ; prévoir une observation post-application.
4. **Tester le changement de version d'oracle** : exercer `assertReceiptDomain` → `ORACLE_VERIFIER_IMPLEMENTATION_CHANGED` avec une suite réelle.
5. **Exercer les topologies déléguées E2E** : ajouter un test qui appelle `delegatedNativeOracleGate.context` avec des refs déléguées réelles et vérifie la clôture.
6. **Clarifier la sémantique de `verifierIdentity`** : documenter la priorité stratégie > actorId > verifierDigest, ou la rendre configurable, pour éviter les ambiguïtés de construction de cas.
7. **Ne pas promouvoir** la capacité « affirmation de mission » tant que les maillons ci-dessus ne sont pas fermés.

## 8. Porte qualité

- Commande : `python scripts/ci/check_code_quality.py`
- Code de sortie : `1`
- Résultat : `7349 source files checked, 45 violations (44 new)`.
- Aucun fichier source n'a été modifié par A5 ; les violations sont préexistantes au baseline (`scripts/ci/quality_baseline.json`) et ne sont pas introduites par cette tâche. 0 nouvelle violation attribuable à A5.

## 9. Artefacts produits

- `docs/06-qualite-preuves/report-A5-integration.md` (ce fichier)
- `docs/06-qualite-preuves/receipts/mission-claim-campaign-result.json`
- Aucune modification de fichier source.