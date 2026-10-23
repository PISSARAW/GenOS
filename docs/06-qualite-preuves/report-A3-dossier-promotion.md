# Rapport A3 — Dossier de preuve & promotion (campagne « affirmation de mission »)

- Agent : A3
- Date : 2026-10-23
- Dépôt : `C:\Users\Shadow\Documents\GitHub\GenOS`
- Commit (working tree préexistant sale) : `92b53bb573761b67f97f5a7a8dd95f7acc8790de`
- Node : `v24.18.0`
- OS : Windows 11 (win32)
- Aucun fichier source modifié. Exécution dans des répertoires temporaires (`os.tmpdir()`). Fichiers de travail : `C:\Users\Shadow\AppData\Local\Temp\opencode\a3-combined.js`, `a3-immutable.js`.

## 1. Commandes exécutées

| # | Commande | Code de sortie | Durée | Date |
|---|---|---|---|---|
| 1 | `node backend/tests/test_promotion_evidence_dossier.js` | 0 | ~2,5 s | 2026-10-23 |
| 2 | `node C:\Users\Shadow\AppData\Local\Temp\opencode\a3-combined.js` | 0 | ~12,9 s | 2026-10-23 |
| 3 | `node C:\Users\Shadow\AppData\Local\Temp\opencode\a3-immutable.js` | 0 | ~2,5 s | 2026-10-23 |

## 2. Test existant `test_promotion_evidence_dossier.js` — code de sortie 0

Durée murale mesurée : **2 513 ms**. Le test exerce dans une base SQLite isolée :

- ouverture de dossiers (`dossiers.open`) liés à un run et à un reçu de rejeu causal vérifié ;
- ajout de deux preuves indépendantes (`verifier-a`, `verifier-b`) ;
- ajout d'une falsification survivante ;
- scellement et vérification des dispositions `escalate`, `promote`, `reject`, `quarantine` ;
- `assertRequired` avec et sans contrat exigeant ;
- immutabilité (UPDATE sur dossier scellé → erreur) ;
- refus d'acteur étranger (`EXECUTION_AUTHORITY_ACTOR_MISMATCH`) ;
- absence de dossier quand le contrat l'exige (`PROMOTION_EVIDENCE_DOSSIER_REQUIRED`) ;
- incohérence des claims (`PROMOTION_EVIDENCE_CLAIMS_MISMATCH`) ;
- falsification auto-vérifiée (`escalate`) ;
- détection de hash incohérent (`quarantine`, raison `hash-mismatch`) ;
- refus pour contre-exemple vérifié (`reject`, `PROMOTION_EVIDENCE_REJECT`).

Assertion finale du test : `Promotion evidence: falsification, independence and bounded dispositions passed.`

## 3. Scénario combiné avec attestation native réelle — PASS

Fichier de travail `a3-combined.js`. Il réutilise le seed de `test_bounded_worker_delegation` et le flux `humanApproval` de `test_native_oracle_completion` pour obtenir un run réel en `awaiting_approval` portant une attestation native acceptée, puis chaîne le dossier de preuve et `approveRun`.

### 3.1 Étapes et résultats

| Étape | Résultat |
|---|---|
| Seed + contrat de mission (reversibility low) | OK — `contractId: strategy_delegation-root_1`, version 1 |
| Dispatch du worker natif (`subset_sum`, cible 10, valeurs [3,5,7]) | Run `strategy_run_…` en `awaiting_approval` (dispatch `success:false` attendu : l'enfant n'est pas « completed » mais en attente d'approbation humaine) |
| Attestation native | `accepted === true`, `costs.processes === 2`, `costs.modelTokens === 0`, `costs.localComputeUsd === null` |
| Acceptation native | `accepted.value.status === 'awaiting_approval'` (liée au statut du run) |
| Reçu de rejeu causal | `status: verified` (`replay-…`) |
| Ouverture du dossier | OK — 1 claim dérivé du rapport du worker (`Scoped procedure 'subset_sum' completed in …`) |
| Ajout de 2 preuves indépendantes | OK — `verifier-a`, `verifier-b`, `producerId: candidate-worker`, `independent: true` |
| Falsification survivante | OK — `verifierId: red-team`, `outcome: survived` |
| Scellement | `disposition === 'promote'`, `authorizesPromotion === false`, `requiresExistingPromotionGate === true` |
| `assertRequired` (contrat exigeant) | OK — `receiptHash` égal au reçu scellé |
| `approveRun` avec `promotionDossierId` | `status === 'completed'` |
| Reprise (second `approveRun`) | `status === 'completed'` (idempotent, pas de double consommation) |

### 3.2 Coûts mesurés (attestation native réelle)

| Champ | Valeur |
|---|---|
| `processes` | 2 |
| `modelTokens` | 0 |
| `runtimeMs` | ~461 (voir A2) |
| `providerUsd` | 0 |
| `localComputeUsd` | null |
| Nonces distincts | 2 |
| Durée murale du scénario combiné | ~12,9 s |

### 3.3 Maillon vérifié

La chaîne bout-en-bout est opérationnelle pour ce parcours :

```
attestation native acceptée (persistée)
  → reçu de rejeu causal vérifié
  → dossier scellé disposition=promote
  → assertRequired consomme le dossier
  → approveRun → status=completed
  → reprise idempotente
```

## 4. Dispositions

| Disposition | Cas de test | Résultat |
|---|---|---|
| `escalate` | Dossier sans preuve (`dossier-technical-success-only`) | `disposition: escalate`, `promotionEligible: false`, raison `claim-quality` |
| `escalate` | Falsification auto-vérifiée (vérificateur = worker) | `disposition: escalate` |
| `promote` | Deux vérificateurs indépendants + falsification survivante | `disposition: promote` |
| `reject` | Falsification `refuted` (`red-team-2`) | `disposition: reject`, `assertRequired` → `PROMOTION_EVIDENCE_REJECT` |
| `quarantine` | Item forgé avec hash incohérent (`0…0`) | `disposition: quarantine`, raison `hash-mismatch` |

## 5. Immuabilité

- UPDATE sur dossier scellé (`SET disposition = 'reject'`) → rejeté par le trigger avec `sealed promotion evidence dossier is immutable` (test existant).
- DELETE sur dossier scellé → rejeté par le trigger avec `promotion evidence dossiers are immutable` (test `a3-immutable.js`, code de sortie 0).
- Conclusion : la table `promotion_evidence_dossiers` est protégée en écriture après scellement, pour UPDATE et DELETE.

## 6. Absence de dossier quand le contrat l'exige

- `assertRequired` sans `dossierId` et contrat `{ promotion: { require_evidence_dossier_v2: true } }` → rejet `PROMOTION_EVIDENCE_DOSSIER_REQUIRED` (test existant, `assertFailClosed`).
- `assertRequired` avec un dossier dont les claims ne correspondent pas → `PROMOTION_EVIDENCE_CLAIMS_MISMATCH`.

## 7. Reprise (`promotionExecutionRecovery`)

- `approveRun` après une première promotion réussie réutilise le journal réservé et appelle `recovery.resume` (chemin `reserved` dans `approveRun`, l. 226-227).
- Résultat observé : statut `completed` à l'identique, sans double consommation de nonces (compteur resté à 2).
- Critère « reprise sans double consommation » : **atteint** pour ce parcours.

## 8. Coûts et durées (synthèse)

| Élément | Valeur |
|---|---|
| `test_promotion_evidence_dossier.js` | 2 513 ms, code 0 |
| Scénario combiné `a3-combined.js` | 12 892 ms, code 0 |
| Test immuabilité `a3-immutable.js` | ~2 500 ms, code 0 |
| Attestation native (processes / modelTokens) | 2 / 0 |
| Nonces | 2 distincts |
| DB | isolée (`os.tmpdir()`), supprimée en fin de run |

## 9. Maillons manquants et blocages documentés

1. **Contrat → obligation de dossier non reliée.** Aucun contrat généré par `strategyContractService.buildPromotion` ne porte `promotion.require_evidence_dossier_v2`. Le drapeau n'est injecté que manuellement (comme dans `test_promotion_evidence_dossier.js` et dans mon `assertRequired` explicite). Par conséquent, dans un run réel, `approveRun` appelle `assertRequired` qui renvoie `null` sans consommer le dossier, même si `promotionDossierId` est fourni. C'est un **maillon manquant** de la chaîne de preuves : la décision de rendre le dossier obligatoire n'est pas rattachée à un profil de mission, à un niveau de risque ou à une politique. À documenter pour A5 et pour un futur ADR.
2. **Vérificateurs du dossier = identifiants, pas code distinct.** Les deux preuves indépendantes utilisent `verifier-a` / `verifier-b` comme identifiants ; le service ne vérifie pas que les vérificateurs exécutent des implémentations distinctes. L'indépendance réelle au niveau du code est du ressort de A5 (deux processus, deux algorithmes).
3. **Dispatch natif `success:false` alors que le run est `awaiting_approval`.** Ce n'est pas un échec : le statut terminal attendu pour une mission à approbation humaine est `awaiting_approval`. Le test `humanApproval` du test natif documente ce même comportement. À ne pas confondre avec une erreur de dispatch.
4. **Lean / preuve formelle native** : non mesuré (hors périmètre A3, absence d'outil).
5. **Topologies déléguées et clôture alternative** : non exercées ici (A5).
6. **Frontière temporelle exacte de `validUntil`** : non testée à la milliseconde (A1).

## 10. Verdict A3

- Critère de succès A3 : promotion complète avec dossier `promote` ; blocage pour `reject`/`quarantine`/`escalate`/absent ; immuabilité vérifiée ; reprise sans double consommation.
- Résultat : **atteint** pour le parcours exercé, avec une attestation native réelle (pas des fixtures) et un `approveRun` qui se termine en `completed`.
- Maillon manquant principal : le couplage contrat → dossier obligatoire n'est pas implémenté dans le contrat généré ; le dossier reste consommable mais optionnel en production. À signaler dans le rapport final (A5).
- Aucune modification de fichier source. Porte qualité non réexécutée (aucun source touché), conformément à A1/A2.