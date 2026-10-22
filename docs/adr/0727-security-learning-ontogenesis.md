# ADR 0727 — Security Learning & Ontogenesis

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Contexte** : Chantier 12 — Apprentissage de sécurité gouverné par GVX, AEIS, la mémoire négative et l'Ontogenèse.

## Contexte et problème

GenOS doit pouvoir tirer parti de ses investigations de sécurité passées sans jamais permettre à des conjectures ou résultats non validés de devenir des vérités consolidées, ni laisser des faux positifs conduire à ignorer automatiquement des alertes futures similaires, ni autoriser la modification d'une politique de sécurité sans une nouvelle validation indépendante.

## Décision

Nous introduisons `backend/src/services/securityLearningOntogenesis/` (exposé via `securityLearningOntogenesisService.js`) qui orchestre un cycle strict en 7 étapes en réutilisant les moteurs existants :

```
Observation → Hypothèse → Test → Vérification → Qualification → Mémoire → Réutilisation contrôlée
```

1. **Ancrage sur GVX, AEIS, Mémoire négative et Ontogenèse** :
   - **Observation & Hypothèse** : Génération d'hypothèses falsifiables via `securityHypothesisEngine` et encapsulation dans un `FormalResult` (`conjecture`) via `formalResultService`.
   - **Test** : Exécution du protocole de falsification et scellement de l'artefact d'essai via le registre de vérificateurs **GVX** (`gvxVerifierRegistry`, `artifact-integrity-v1`).
   - **Vérification** : Évaluation d'assurance épistémique **AEIS** (`evaluateEpistemicAssurance`) exigeant des reçus signés (`epistemicVerifierReceiptService`) issus d'au moins deux vérificateurs indépendants enregistrés dans `verifierTrustRegistry`.
   - **Qualification & Mémoire** : Seul un résultat corroboré et validé par AEIS (`CONFIRMED_INCIDENT`) peut être enregistré comme vérité (`decision` / `constraint`) dans l'**Ontogenèse** (`ontogenesis/memoryService`) et le ledger **GVX** (`gvxDevelopmentLedger`). Tout résultat non vérifié reste une `unvalidated_conjecture` (`validatedTruth: false`) interdite de promotion en vérité (`SECURITY_LEARNING_UNVALIDATED_TRUTH_FORBIDDEN`).
2. **Traitement des faux positifs sans suppression automatique d'alertes** :
   - Un résultat réfuté et vérifié (`FALSE_POSITIVE`) est inscrit dans `NegativeSearchMemory` et dans la mémoire d'échec d'Ontogenèse (`kind: 'failure'`), et met à jour `securityConfidenceCalibrator`.
   - Lors d'alertes similaires ultérieures (`evaluateAlertConfidenceWithHistory`), la confiance est modulée à la baisse (`adjustedConfidence < rawConfidence`), mais `autoIgnore` et `suppressed` demeurent systématiquement à `false` (`mustInvestigate: true`).
3. **Validation indépendante obligatoire des modifications de politiques de sécurité** :
   - `validateSecurityPolicyModification` interdit toute réutilisation directe d'une validation d'investigation passée (`SECURITY_POLICY_REUSED_VALIDATION_FORBIDDEN`) et exige une nouvelle assemblée AEIS indépendante liée au `policyDiffDigest` ainsi qu'un verdict `accept` de l'`Independent Auditor`.

## Conséquences

- Aucun système d'apprentissage parallèle n'est introduit : GVX, AEIS, `NegativeSearchMemory` et `ontogenesis/memoryService` assurent la continuité épistémique.
- Les résultats non vérifiés ne polluent jamais la mémoire de vérité.
- Les faux positifs enrichissent le triage futur sans créer d'angle mort automatique.
