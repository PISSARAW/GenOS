# ADR 0159 — No-report et ablations croisées

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Évaluation, ablations, plan factoriel
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/noReportAblationService.js` (`validateRegistration`, `scoreBehavior`, `factorialCompare`)
  - Tests : `../../backend/tests/test_no_report_ablation.js`

## Contexte

Les rapports textuels pouvaient contaminer les scores d'ablation, et les effets croisés se mélangeaient aux effets principaux faute de préenregistrement des facteurs.

## Décision

Les résultats no-report sont calculés depuis le comportement instrumenté (moyenne des valeurs numériques) ; le texte et ses claims sont conservés comme métadonnées (`textIgnored: true`, `claimsCount`) mais n'entrent pas dans le score. Les facteurs sont préenregistrés (protocole + ≥ 2 facteurs, `preregistered`) et les effets croisés restent séparés des effets principaux (`effects` par facteur, `interactions` signalées dès 4 runs).

## Conséquences

- Positives : score insensible au texte, préenregistrement obligatoire, effets factoriels séparés.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; score moyen simple, sans inférence ni puissance.
- Neutres : un run sans valeur comportementale numérique donne un score `null`.

## Alternatives

- **Score incluant le texte** : rejetée — contamination du résultat par le récit.
- **Ablation sans préenregistrement** : rejetée — facteurs choisis après coup.
