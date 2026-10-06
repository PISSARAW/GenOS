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

Les nouveaux contrats générés activent `require_epistemic_assurance` par défaut.
Les contrats historiques conservent leur politique enregistrée :

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

La clé de signature doit être injectée par l'opérateur, via
`GENOS_EPISTEMIC_RECEIPT_SECRET` avec le keyring versionné documenté dans la
[fiche AEIS](../01-concepts/adaptive-epistemic-immune-system.md).
Elle ne doit jamais être placée dans le contrat, le rapport d'agent ou le dépôt.

Quand la politique est active, la gate exige un assemblage épistémique complet.
Deux chemins d'alimentation existent :

- `executionContext.epistemicAssembly`, fourni à l'évaluateur de politique par
  un appelant runtime de confiance ;
- `aeisEvaluation.assembly` calculé par `evaluateReportWithAeis()` pendant
  `approveRun()` et injecté par `buildGateContext()` (`promotionGateContext.js`).

Une assemblée seulement déclarée dans `report.epistemicAssembly` est ignorée.
Dans `approveRun()`, le runtime exécute les vérificateurs et conserve son veto,
même si un contrat historique n'exige pas l'assemblage. Une assemblée refusée
reste persistée pour l'audit et la mémoire, sans autoriser la promotion.

L'absence d'assemblée dans le contexte de confiance bloque la promotion avec la politique
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
statut et cette indépendance. La signature HMAC-SHA256 couvre tous ces champs
(`backend/src/services/epistemicVerifierReceiptService.js` : `signatureFor`,
`issueReceipt`, `validateReceipt` en temps constant via `timingSafeEqual`).
Conditionnalité : l'émission et la validation exigent `GENOS_EPISTEMIC_RECEIPT_SECRET`
(`keyFor()` lève si absent, `validateReceipt` retourne `false`) — sans secret
configuré, aucun reçu ne peut être signé ni validé.

Les clés restent partagées par le processus backend : le HMAC protège
l'intégrité des reçus après émission, mais ne constitue pas une frontière
d'isolation entre modules du même processus.

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

Les nouveaux contrats activent la politique par défaut. Un contrat historique
sans cette politique peut migrer en
produisant d'abord ses résultats formels et ses reçus, puis en activant la gate dans
une nouvelle version de son contrat. Une mission à enjeu mathématique, scientifique
ou de sécurité devrait l'activer avant sa première exécution.

Le runtime ne décide pas l'équivalence ou la vérité générales. Une équivalence non
identique exige un témoin fourni par un vérificateur de domaine. De même, deux
attestations identiques réduisent le risque de contrainte oubliée sans prouver que
la spécification humaine initiale était exhaustive.

## Garanties AEIS dans `approveRun()`

- L'affirmation doit décrire exactement le prédicat de commande exécuté :
  `<commande> outputs "<valeur>"` ou `<commande> exits with code 0`.
- Le quorum comporte au moins deux vérificateurs exécutés indépendamment, dans
  des workspaces distincts, avec reçus signés liés au résultat et à sa preuve.
  La ré-arbitration conserve les descripteurs des lots précédents.
- Les niches sont recrutées selon pression, preuves observées et budget. Le
  rapport contient au maximum 32 claims traitées séquentiellement ; le budget
  par claim doit permettre de 2 à 8 exécutions.
- Si la politique multi-provider est active, tous les providers distincts
  configurés doivent terminer et soutenir l'affirmation. Leurs avis structurés
  sont complémentaires au quorum exécutable ; un transport réussi ne suffit pas.
- Les revues provider s'exécutent dans des processus enfants bornés, avec
  environnement réduit et SQLite en mémoire. Le heap Node limité à 128 Mio
  ne constitue pas une limite de mémoire totale ni un conteneur.
- Un timeout est inconclusif. Une contre-preuve exécutée et confirmée reste
  opposable au Host et au régulateur.

## Mémoire et autorité persistantes

La mémoire est isolée par organisation/projet/workspace et bornée à 1 000 entrées
par portée. Sa résolution relit l'assemblée signée. Elle rappelle aussi les
échecs confirmés, même à affinité de succès nulle, et déduplique le rejeu du même
identifiant de preuve. Une nouvelle exécution signée est une nouvelle observation.

La dissonance d'autorité est dédupliquée séparément par run et prédicat canonique.
Les seuils 5/15/30/50 correspondent à l'avertissement, à la restriction des
lancements, à la quarantaine et à l'apoptose. Les contrôles runtime refusent aussi
les descendants d'un agent révoqué. Cette révocation retire les droits ; elle
ne tue pas les processus externes déjà lancés.

Voir [ADR 0327](../adr/0327-aeis-preuves-et-autorite-persistante.md) et la
[matrice de qualification AEIS](../01-concepts/adaptive-epistemic-immune-system.md#9-qualification-opérationnelle).

## Vérification locale

```powershell
npm --prefix backend run test:aeis
node backend/tests/test_formal_result_contract.js
node backend/tests/test_epistemic_assurance.js
npm test
cargo test --workspace
```

Les scénarios adversariaux couvrent les contraintes absentes, les preuves altérées,
les reçus forgés, les doublons, les contradictions, les graphes incomplets, les
échecs hors domaine et les contributions non reliées.
