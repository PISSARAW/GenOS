# Immunité épistémique

## Objectif

L'immunité épistémique empêche la promotion d'une synthèse lorsque sa cohérence
n'est établie que par du texte libre, une similarité vectorielle ou un merge de
fichiers. Elle s'appuie sur le résultat formel `genos.formal-result/v1` et produit
une décision bornée et auditable. Elle ne constitue pas un oracle de vérité
mathématique générale.

Le mécanisme reprend trois idées biologiques :

- le complexe majeur d'histocompatibilité expose l'identité, les hypothèses et le
  domaine de chaque résultat ;
- le ganglion épistémique assemble les dépendances, contradictions et influences
  dans un graphe ;
- la cascade de complément bloque la promotion dès qu'une obligation manque.

## Activation

La gate est volontairement explicite afin de préserver les contrats historiques :

```json
{
  "promotion": {
    "require_epistemic_assurance": true,
    "epistemic_verifier_digests": [
      "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    ]
  }
}
```

Le secret `GENOS_EPISTEMIC_RECEIPT_SECRET` doit être injecté par l'opérateur. Il ne
doit jamais être placé dans le contrat, le rapport d'agent ou le dépôt.

Quand la politique est active, la gate exige un assemblage épistémique complet.
Deux chemins d'alimentation existent :

- `report.epistemicAssembly` porté par le rapport final ;
- `aeisEvaluation.assembly` calculé par `evaluateReportWithAeis()` pendant
  `approveRun()` et injecté par `buildGateContext()` (`promotionGateContext.js`).

L'absence des deux bloque la promotion avec la politique
`require_epistemic_assurance`.

## Contrat de l'assemblage

L'assemblage contient les sections suivantes :

| Champ | Rôle |
|---|---|
| `results` | Résultats formels canoniques à assembler |
| `obligations` | Contraintes et questions qui doivent être couvertes |
| `coverage` | Liens entre obligation, résultat et digest de preuve |
| `constraintAttestations` | Deux recensements indépendants du même ensemble d'obligations (construits depuis les receipts indépendants par `buildConstraintAttestations`) |
| `verifications` | Reçus authentifiés de vérificateurs indépendants |
| `equivalences` | Équivalences accompagnées d'un témoin |
| `deduplications` | Groupes équivalents coalescés vers un résultat canonique |
| `relations` | Relations de support ou de contradiction entre résultats |
| `contradictionResolutions` | Décisions attestées sur les contradictions applicables |
| `compositionRoots` | Conclusions finales du graphe de preuve |
| `failureReuses` | Réutilisations de mémoire négative et leur domaine d'applicabilité |
| `contributions` | Résultats utilisés ou rejetés pour chaque worker |

Les identifiants cités par `coverage`, `compositionRoots` et `contributions` doivent
correspondre aux `resultId` recalculés par le runtime. Un résultat fourni par un
agent n'est donc pas accepté sur la seule foi de ses empreintes déclarées.

## Reçus de vérification

Le FormalResult est créé **avant** la vérification (`bindAntigenToFormalResult`) :
l'antigène porte ensuite `id = resultId` et `evidence.digest` du FormalResult.
Un adaptateur de domaine exécute son vérificateur — les adapters test/artifact
lancent réellement leur commande via `sandboxExecutor.runIsolated()` sous
allowlist, et `verified` dépend du exit code réel — puis appelle
`issueReceipt()` avec ce `resultId`, ce digest de preuve et le digest du
vérificateur résolu dans le registre central (`verifierTrustRegistry`, digest
stable `type + version + policy`, source unique des contrats et des reçus).
L'indépendance est évaluée **avant** signature, contre le **producer** du claim
puis contre les verifiers précédents ; le reçu lie aussi la date, un nonce, le
<<<<<<< HEAD
statut et cette indépendance. La signature HMAC (`epistemicVerifierReceiptService.js`,
`crypto.createHmac('sha256', secretKey)`) couvre tous ces champs, uniquement si
`GENOS_EPISTEMIC_RECEIPT_SECRET` est injecté par l'opérateur : sans ce secret,
`issueReceipt()` lève une erreur et `validateReceipt()` retourne `false`, ce qui
bloque la promotion. Le secret ne doit jamais figurer dans le contrat, le rapport
d'agent ou le dépôt.
=======
statut et cette indépendance. La signature HMAC-SHA256 couvre tous ces champs
(`backend/src/services/epistemicVerifierReceiptService.js` : `signatureFor`,
`issueReceipt`, `validateReceipt` en temps constant via `timingSafeEqual`).
Conditionnalité : l'émission et la validation exigent `GENOS_EPISTEMIC_RECEIPT_SECRET`
(`secretKey()` lève si absent, `validateReceipt` retourne `false`) — sans secret
configuré, aucun reçu ne peut être signé ni validé.
>>>>>>> 00205b1d9 ([DOC] Corrige chemins docs vers code reel (AEIS, search, crates, ADR))

À la promotion, `validateReceipt()` vérifie simultanément :

1. la signature en temps constant ;
2. l'appartenance du vérificateur à la liste du contrat (résolue depuis le
   registre central, jamais vide par défaut) ;
3. la liaison au résultat et à son digest de preuve (`receipt.resultId` et
   `evidenceDigest` identiques à ceux du FormalResult) ;
4. le statut réussi et l'indépendance déclarée.

Modifier un champ après émission invalide le reçu. Ajouter une nouvelle empreinte
de vérificateur dans le rapport ne donne aucun droit : seule la liste du contrat est
utilisée par la politique de promotion. Un verifier sans commande configurée rend
`inconclusive` au lieu de simuler un succès.

## Sémantique des refus

La gate retourne des politiques suffixées, par exemple :

- `require_epistemic_assurance.constraint_closure` ;
- `require_epistemic_assurance.semantic_deduplication` ;
- `require_epistemic_assurance.logical_contradiction` ;
- `require_epistemic_assurance.proof_verification` ;
- `require_epistemic_assurance.failure_applicability` ;
- `require_epistemic_assurance.causal_contribution` ;
- `require_epistemic_assurance.proof_composition`.

Ces refus doivent être corrigés en ajoutant une preuve ou un témoin. Ils ne doivent
pas être contournés par une annotation, une baisse de score ou une approbation
humaine non liée à l'assemblage.

## Ordre de promotion

L'ordre obligatoire est : résultat formel, recensement des obligations,
vérification indépendante, résolution des contradictions, composition du graphe,
puis seulement merge du workspace. Un merge three-way réussi ne fournit aucune
preuve sur la validité de la conclusion.

## Migration et limites

La politique est désactivée par défaut. Une mission existante peut migrer en
produisant d'abord ses résultats formels et ses reçus, puis en activant la gate dans
une nouvelle version de son contrat. Une mission à enjeu mathématique, scientifique
ou de sécurité devrait l'activer avant sa première exécution.

Le runtime ne décide pas l'équivalence ou la vérité générales. Une équivalence non
identique exige un témoin fourni par un vérificateur de domaine. De même, deux
attestations identiques réduisent le risque de contrainte oubliée sans prouver que
la spécification humaine initiale était exhaustive.

## Vérification locale

```powershell
npm run test:aeis
node backend/tests/test_formal_result_contract.js
node backend/tests/test_epistemic_assurance.js
npm test
cargo test --workspace
```

Les scénarios adversariaux couvrent les contraintes absentes, les preuves altérées,
les reçus forgés, les doublons, les contradictions, les graphes incomplets, les
échecs hors domaine et les contributions non reliées.
