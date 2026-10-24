# Répétition SHEV protocole d'une heure — 2026-10-24

## Résultat

La répétition technique s'est terminée sans erreur après **3 603 986 ms**. Elle a
exécuté 5 fenêtres d'apprentissage et 20 fenêtres réservées dans chacun des deux bras.
Le manifeste et le rapport portent le mode `protocol`, le statut `protocol_only`,
`benchmarkQualified: false` et `promotionEligible: false`.

Le rapport indique `complete: true`, `durationMet: true` et des critères statistiques
tous vrais. Ces valeurs sont issues de la fixture synthétique du dépôt : elles valident
le chemin de calcul et d'export, pas l'efficacité réelle de l'intervention.

## Preuves

- Campagne : `phase7-one-hour-2026-10-24T16-37-57-544Z-rehearsal`
- Digest du manifeste : `999a2133764a48ecefb3c651fd842ee5dcfc790291425a84dc23955678445086`
- Digest de l'export : `1a7cbb91f969f302d07e4dc87be2b078777450825415bc2e05a53f89aed3d432`
- Rapport conservé dans `artifacts/phase7-one-hour-2026-10-24T16-37-57-544Z-rehearsal/one-hour-report.json`
- Export archivé hors du dépôt :
  `D:\GenOS-runs\phase7-one-hour-archive-2026-10-24T16-37-57-544Z\1a7cbb91f969f302d07e4dc87be2b078777450825415bc2e05a53f89aed3d432.json`
- `status` a été réhydraté dans un nouveau processus en lecture seule ; la base n'a pas
  été modifiée par cette vérification.

## Conclusion

**Succès d'exécution du protocole**, sans échec technique observé. Ce résultat n'est pas
un succès terrain, ne qualifie pas le benchmark et ne constitue pas une preuve empirique :
les producteurs, observateurs, vérificateurs et espaces de travail provenaient de la
fixture synthétique. Une campagne `field` reste soumise à ses verrous et à son horizon
minimum de 72 heures.
