# ADR 0159 — No-report et ablations croisées

- **Statut** : Accepté (portée Node ; sans équivalent Rust)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Évaluation, ablations, plan factoriel
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/noReportAblationService.js` (`validateRegistration`, `scoreBehavior`, `factorialCompare`)
  - Tests : `../../backend/tests/test_no_report_ablation.js`
  - `../../backend/src/services/consciousnessEvidence/dissociationBenchmarkService.js`
  - Contrats : `../../spec/consciousness-dissociation-suite.schema.json`,
    `../../spec/consciousness-dissociation-result.schema.json`

## Contexte

Les rapports textuels pouvaient contaminer les scores d'ablation, et les effets croisés se mélangeaient aux effets principaux faute de préenregistrement des facteurs.

## Décision

Les résultats no-report sont calculés depuis le comportement instrumenté (moyenne des valeurs numériques) ; le texte et ses claims sont conservés comme métadonnées (`textIgnored: true`, `claimsCount`) mais n'entrent pas dans le score. Les facteurs sont préenregistrés (protocole + ≥ 2 facteurs, `preregistered`) et les effets croisés restent séparés des effets principaux (`effects` par facteur, `interactions` signalées dès 4 runs).

Le banc de dissociation ajoute quatre conditions appariées : contrôle perceptif,
traitement sans rapport, rapport sans stimulus courant et contrôle nul. Il exige
les mêmes seed et locks modèle/outils/budget, ainsi qu'un seuil de performance
préenregistré. Les champs de texte autorapporté sont refusés, et le résultat ne
peut porter que l'interprétation `functional_dissociation_only` avec promotion
et inférence phénoménale désactivées.

## Conséquences

- Positives : score insensible au texte, préenregistrement obligatoire, effets factoriels séparés et contrat de dissociation validable.
- Négatives : portée Node uniquement — aucun pendant Rust ; score simple, sans inférence ni puissance.
- Neutres : un run sans valeur comportementale numérique donne un score `null`.
- Les analogies avec le blindsight et le rêve décrivent des dissociations logicielles
  bornées ; elles ne reproduisent ni les phénomènes neurologiques ni leur vécu.

## Alternatives

- **Score incluant le texte** : rejetée — contamination du résultat par le récit.
- **Ablation sans préenregistrement** : rejetée — facteurs choisis après coup.
