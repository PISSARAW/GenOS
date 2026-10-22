# ADR 0721 — Moteur de rapports de preuves de sécurité (SERE)

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Domaine** : sécurité, preuves, vérification déterministe, rapports jury
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0613, ADR 0649, ADR 0709

## Contexte

Disposer de preuves unitaires et de reçus d’exécution ne garantit pas qu’un
rapport de cybersécurité soit complet, exact et reproductible. Un récit libre
ou un export HTML/PDF non vérifié peut omettre une action hors périmètre,
masquer une réfutation, oublier les limites de visibilité ou présenter un
document de surface comme s’il détenait l’autorité.

## Décision

GenOS introduit le **Security Evidence Report Engine (SERE)** sous
`backend/src/services/securityEvidenceReport/`. Le moteur assemble de manière
déterministe huit sections canoniques et scellées par SHA-256 :

1. **Mandat et périmètre** (`mandate`) : cibles autorisées (`inScopeTargets`),
   exclusions explicites (`outOfScopeTargets`), catégories et règles d’engagement.
2. **Observations classées par source** (`observations`) : articles normalisés
   avec condensats d’artefacts et regroupement déterministe `bySource`.
3. **Événements regroupés en chronologie** (`chronology`) : séquence ordonnée et
   regroupement par phases (`buckets`) avec références de preuves résolubles.
4. **Hypothèses, confirmations, réfutations et inconnues** (`hypotheses`) :
   état épistémique vérifié, confirmations indépendantes, contre-exemples et
   inconnues résiduelles explicites.
5. **Actions autorisées et réellement exécutées** (`actions`) : réconciliation
   automatique `authorizedAndExecuted`, `authorizedNotExecuted` et
   `unauthorizedExecuted`.
6. **Différences avant/après** (`beforeAfter`) : snapshots, condensats, deltas
   métriques, actions causales et reçu de vérificateur.
7. **Limitations de visibilité** (`visibilityLimitations`) : angles morts,
   raisons d’isolation et impact sur la portée des conclusions.
8. **Décisions et responsables** (`decisions`) : disposition, acteur responsable
   identifié (`actorId`, `name`, `role`, `authorityRef`), motif et preuves citées.

Le moteur produit systématiquement deux représentations liées :

- un **dossier structuré vérifiable par machine** (`genos.security-evidence-report-dossier/v1`)
  accompagné de son reçu de vérification (`genos.security-evidence-report-verification/v1`)
  et d’un export sur disque (`dossier.json`, `verification.json`, `presentation.json`, `manifest.json`) ;
- un **document lisible pour le jury** (`genos.security-evidence-report-presentation/v1`,
  `jury-report.md` et `jury-report.html` prêt pour impression/PDF), projeté
  strictement depuis le dossier scellé.

## Invariants

- **Séparation de l’autorité et de la présentation** : le PDF, le HTML ou le
  Markdown porte `authority: "none"` et `isPresentationOnly: true`. Toute
  tentative d’utiliser la présentation comme source d’autorité échoue fermé
  (`SERE_PRESENTATION_NOT_AUTHORITATIVE`).
- **Exactitude et indépendance** : une hypothèse `confirmed` exige une
  confirmation indépendante (`verifierId` distinct du producteur et du proposant)
  et zéro réfutation ; toute réfutation domine.
- **Conformité au mandat** : un conflit entre cibles incluses et exclues, une
  observation hors périmètre ou une action exécutée non autorisée est rejeté.
- **Traçabilité fermée** : chaque étiquette du document jury (`[obs:...]`,
  `[hyp:...]`, `[act-exec:...]`, `[diff:...]`, `[lim:...]`, `[dec:...]`,
  `[resp:...]`) est vérifiée contre le dossier machine ; aucune omission ni
  invention n’est tolérée.
- **Pont campagne sans faits synthétiques** : l'adjudication est recalculée depuis
  la campagne et ses reçus. Le pont exige les observations horodatées, la
  chronologie, les autorisations, les exécutions, les différences, les limites
  et les décisions comme preuves fournies ; il ne fabrique plus ces éléments.
- **Export lié** : le manifeste vérifie aussi `presentation.json` et lie ses
  empreintes au dossier et au reçu de vérification recalculé.
- **Non-promotion** : `promotionEligible` et `authorizesPromotion` restent à
  `false`.

## Validation

- `backend/tests/test_security_evidence_report_engine.js` vérifie l’assemblage
  des huit piliers, la reproductibilité par permutation, l’export/vérification
  du dossier machine et du document jury, le rejet des actions non autorisées,
  la dominance des réfutations, la quarantaine sur altération de hash et le pont
  depuis `securityRemediation`.
