# ADR 0522 — Lier la calibration Brier à un reçu de résolution

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : Biocénose, calibration, autorité des outcomes
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0097 — Calibration immunitaire de l'Holobionte

## Contexte

La persistance de calibration du runtime Biocénose filtrait les issues à l'aide
d'un reçu de résolution vérifié. Le service `recordCalibrationOutcome` restait
toutefois appelable sans ce reçu et écrivait une référence d'oracle libre. En
parallèle, `brierConsensus` acceptait directement une valeur `oracleResult` et
pouvait modifier les poids même si aucune issue n'avait été vérifiée.

La provenance doit être contrôlée au point d'écriture comme au point de calcul.
Une valeur brute ou une référence textuelle n'établit pas que l'issue concerne
la même communauté, le même événement et le même domaine.

## Décision

Le service de calibration exige désormais un reçu `VERIFIED`, un validateur de
confiance et la correspondance exacte communauté/événement/domaine/outcome/référence.
Le runtime transmet ce reçu au service de persistance, qui revalide le contrat au
lieu de dépendre uniquement de son préfiltre.

Le calcul Brier exige aussi un reçu `VERIFIED` accepté par le validateur, lié au
contexte et à l'outcome fourni. Sans cette preuve, il retourne un score absent et
ne modifie aucun poids. La calibration stockée conserve `oracle_ref` comme pointeur
de provenance ; elle ne prétend pas conserver une copie autonome du reçu original.

## Conséquences

### Positives

- Les API de persistance et de calcul appliquent la même autorité d'issue que le
  runtime de délibération.
- Une issue manquante, non fiable ou liée à un autre contexte ne change pas la
  réputation ni le consensus pondéré.

### Négatives

- Les intégrateurs doivent fournir le reçu et un validateur de confiance explicite.
- Les lignes historiques conservent une référence, pas l'original du reçu ; leur
  revalidation cryptographique après écriture dépend de la source référencée.

## Alternatives

- Accepter `oracleResult` et `oracleRef` comme assertions du caller : rejeté, car
  le caller pourrait fabriquer la vérité qui pondère son propre vote.
- Faire confiance seulement au préfiltre du runtime : rejeté, car le service de
  persistance est aussi un point d'entrée autonome.
