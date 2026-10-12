# ADR 0447 — Lier résolution et score du variant Forecasting Crowd

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Domaine** : Biocénose, Forecasting Crowd, preuve de calibration
- **Lié à** : [ADR 0333](0333-biocenose-cycle-persistant-et-finalisation.md)

## Contexte

Le cycle Forecasting Crowd acceptait une résolution externe dès que son reçu
portait `VERIFIED` et qu'un callback de confiance l'approuvait. Il ne vérifiait
pas que ce reçu désignait la communauté, l'événement, le domaine et la valeur
de résultat soumis. Le score Brier du tour utilisait aussi les résultats
fournis par l'appelant avant de connaître les résolutions enregistrées.

## Décision

La calibration du cycle exige un reçu vérifié, une référence identifiable et
une validation externe explicite. Le reçu doit porter les mêmes `communityId`,
`eventId`, `domain` et `outcome` binaire que la résolution. Si l'appelant donne
`oracleRef`, il doit désigner le `receiptId` ou la référence du reçu. Un
désaccord est ignoré sans ligne de calibration. Le score Brier du cycle est
calculé exclusivement sur les résolutions admises et enregistrées. Sa clé
associe l'événement au domaine pour empêcher qu'un résultat d'un autre domaine
ne note une prévision homonyme.

## Limites

Le runtime vérifie la liaison et le retour de `isTrustedReceipt` ; il ne
fabrique ni ne signe la preuve d'un oracle. L'appelant doit configurer un
validateur fiable. L'API directe `recordCalibrationOutcome` conserve son
contrat de provenance fourni par l'appelant et ne bénéficie pas de cette
preuve du cycle Forecasting Crowd. La campagne avec un oracle réel reste à
qualifier séparément.
