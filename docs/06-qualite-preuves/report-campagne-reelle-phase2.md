# Rapport — Campagne réelle Phase 2 (couplage + C4)

Date : 2026-10-23.

## Modifications appliquées

1. **Couplage contrat→dossier** : `strategyContractService.buildPromotion` active
   `require_evidence_dossier_v2 = true` pour tout contrat v2. Vérifié par script :
   `require_evidence_dossier_v2 = true` pour un contrat v2 avec oracle.

2. **Champ `effectObservation`** : ajouté à `missionOutcomeContract` (optionnel,
   validé pour v2 uniquement). Contient `metric`, `horizon`, `environment`.
   Propagé dans le contrat de stratégie comme `effect_observation`.

3. **Hook C4** : `approveRun` enregistre `gateContext.effectObservationIntent`
   si `effectObservation` est présent. Persisté dans le journal de promotion.

4. **ADR 0732** créé et index mis à jour.

## Tests exécutés

- `test_mission_outcome_contract.js` : PASS
- `test_mission_outcome_falsification.js` : PASS
- `test_strategy_contracts.js` : PASS
- `test_promotion_evidence_dossier.js` : PASS
- `test_promotion_execution_recovery.js` : PASS

## Résultat

- Couplage vérifié par construction (script temporaire).
- C4 : intention enregistrée, mais effet métier non mesuré (pas d'observation
  post-application). Verdict reste `not_operational` pour le niveau C4.
- Aucune nouvelle violation introduite par ces modifications (vérification manuelle
  des limites : lignes, paramètres, complexité).
- Porte qualité non exécutable proprement (baseline incomplet, 46 violations
  préexistantes non liées à ces modifications).
