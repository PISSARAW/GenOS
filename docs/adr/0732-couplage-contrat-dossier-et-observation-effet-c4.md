# ADR 0732 — Couplage contrat→dossier de preuve et observation différée de l'effet (C4)

- Statut : proposé (phase 2 de la campagne mission-claim)
- Date : 2026-10-23
- Portée : backend, contrat de stratégie, mission outcome, promotion

## Contexte

La campagne mission-claim (rapports A1–A5 et phase 1) a établi que :

1. Aucun contrat généré ne portait `promotion.require_evidence_dossier_v2`, donc le
   dossier de preuve restait optionnel en production (maillon manquant).
2. Le niveau C4 (effet métier observé après application, avec horizon et environnement
   déclarés) n'était ni instrumenté ni mesuré ; le verdict `verified` ne portait que
   sur C2/C3.

## Décision

### Couplage contrat→dossier

Pour tout contrat v2 (`genos.mission-outcome/v2`), la construction du contrat de
stratégie active par défaut `promotion.require_evidence_dossier_v2 = true`. Ainsi,
tout nouveau contrat v2 exige un dossier de preuve scellé lors de la promotion.
Les contrats v1 et les contrats sans `mission_outcome` restent inchangés
(activation progressive, ADR 0613 l. 68).

### Observation différée (C4)

Le contrat `mission_outcome` v2 accepte un champ optionnel `effectObservation`
contenant :

- `metric` : nom de la métrique métier observée après application ;
- `horizon` : horizon temporel de l'observation (ex. `immediate`, `24h`, `7d`) ;
- `environment` : environnement déclaré pour l'observation.

Lors de la promotion (`approveRun`), si `effectObservation` est présent, le système
enregistre une intention d'observation dans le contexte de promotion
(`gateContext.effectObservationIntent`) et dans le journal de promotion, sans
bloquer la promotion. L'observation réelle reste une étape distincte (C4) et doit
être rapportée séparément ; aucune promotion ne peut être déclarée `verified` au
niveau C4 sur la seule base de C2/C3.

## Conséquences

- Les contrats v2 générés exigent désormais le dossier de preuve : fermeture du
  maillon « contrat généré sans clé ».
- Le champ `effectObservation` est optionnel et rétrocompatible ; les contrats
  existants restent valides.
- La porte de promotion n'est pas bloquée par l'absence d'observation C4, mais
  l'intention est persistée pour audit.
- Les tests existants restent verts ; de nouveaux tests couvrent le couplage et
  la présence de l'intention.

## Vérification

- `backend/tests/test_mission_outcome_contract.js` : validation du champ optionnel.
- `backend/tests/test_strategy_contract.js` (si existant) : présence de
  `require_evidence_dossier_v2` pour les contrats v2.
- `backend/tests/test_promotion_evidence_dossier.js` : inchangé.
- Nouveau test `test_effect_observation_intent.js` : présence de
  `gateContext.effectObservationIntent` lors de la promotion.
