# Moteur de rapports de preuves de sécurité (SERE)

- **Statut** : Implémenté
- **Portée** : `backend/src/services/securityEvidenceReport/`, `backend/src/controllers/securityController.js`, `backend/src/routes/securityRoutes.js`
- **Promotion** : toujours interdite (`promotionEligible: false`, `authorizesPromotion: false`)
- **Dernière revue** : 2026-10-22

Le **Security Evidence Report Engine (SERE)** assemble un rapport de
cybersécurité complet, exact et reproductible à partir des données, des preuves
et des reçus de vérificateurs indépendants.

## Principe d’autorité

Le PDF, le HTML ou le Markdown n’est que la présentation. L’autorité réside
exclusivement dans les données canoniques, les preuves et les vérificateurs :

- le **dossier machine** (`genos.security-evidence-report-dossier/v1`) et son
  **reçu de vérification** (`genos.security-evidence-report-verification/v1`)
  portent les condensats SHA-256 canoniques et les contrôles d’intégrité ;
- le **document jury** (`genos.security-evidence-report-presentation/v1`,
  décliné en Markdown et HTML imprimable/PDF) porte `authority: "none"` et
  `isPresentationOnly: true`. Toute tentative de soumettre une représentation de
  présentation au vérificateur d’autorité échoue fermé avec
  `SERE_PRESENTATION_NOT_AUTHORITATIVE`.

## Les huit sections assemblées

| Section | Contenu assemblé | Contrôle du vérificateur |
| --- | --- | --- |
| `mandate` | Mandat, émetteur, fenêtre de validité, `inScopeTargets`, `outOfScopeTargets`, règles d’engagement | Refuse tout conflit entre cibles autorisées et exclues (`SERE_MANDATE_SCOPE_CONFLICT`) |
| `observations` | Observations avec condensat d’artefact, producteur, vérificateur et regroupement déterministe `bySource` | Refuse toute observation hors périmètre (`observation-out-of-scope`) ou hash invalide |
| `chronology` | Événements ordonnés chronologiquement et regroupés par phases (`buckets`) | Vérifie l’ordre temporel et la résolution de chaque `evidenceRef` |
| `hypotheses` | Hypothèses, confirmations, réfutations (contre-exemples) et inconnues résiduelles | Exige un vérificateur indépendant pour `confirmed`, fait dominer toute réfutation et exige la déclaration des inconnues |
| `actions` | Actions autorisées (`authorized`), exécutées (`executed`) et réconciliation automatique | Signale et rejette toute action exécutée non autorisée ou hors périmètre (`unauthorized-action-executed`) |
| `beforeAfter` | Snapshots avant/après, digests SHA-256, deltas métriques, actions causales et vérificateur | Vérifie l’existence des actions liées et la cohérence entre digests et `delta.changed` |
| `visibilityLimitations` | Angles morts, catégories d’isolation, motifs, impacts sur la conclusion et hypothèses affectées | Vérifie le rattachement aux hypothèses connues |
| `decisions` | Décisions, disposition, responsable identifié (`actorId`, `name`, `role`, `authorityRef`), motif et preuves | Vérifie l’attribution du responsable et la résolution de toutes les références de preuves |

## Deux représentations vérifiées

1. **Dossier structuré vérifiable par machine** (`exportSereBundle` / `verifyExportedSereBundle`) :
   - `dossier.json` (JSON canonique à clés triées, scellé par `dossierHash`) ;
   - `verification.json` (reçu déterministe `verificationHash`) ;
   - `manifest.json` (registre des empreintes SHA-256 et du statut `authoritative: true/false` de chaque fichier).
2. **Document lisible pour le jury** (`renderJuryDocument` / `verifyJuryPresentation`) :
   - `jury-report.md` et `jury-report.html` ;
   - chaque entité des huit sections est citée par étiquette traçable (`[mandate:...]`, `[obs:...]`, `[evt:...]`, `[hyp:...]`, `[conf:...]`, `[ref:...]`, `[unk:...]`, `[act-auth:...]`, `[act-exec:...]`, `[diff:...]`, `[lim:...]`, `[dec:...]`, `[resp:...]`) ;
   - `verifyJuryPresentation` refuse toute omission (`uncoveredTags`) ou invention (`fabricatedTags`).

## Vérification

```bash
node backend/tests/test_security_evidence_report_engine.js
```
