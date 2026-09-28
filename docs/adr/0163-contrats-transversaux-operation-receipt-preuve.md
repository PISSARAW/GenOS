# ADR 0163 — Contrats transversaux d'opération : événement, reçu et preuve

- **Statut** : Accepté
- **Date** : 2026-09-28
- **Domaine** : Contrats, provenance, budgets, orchestration, preuve
- **Décideurs** : Mainteneurs GenOS
- **Lié à** :
  - ADR 0161 (contrats communs du runtime biologique)
  - ADR 0162 (niveaux de preuve et gel phase 0)
  - ADR 0138 (persistance des reçus contractuels versionnés)
  - ADR 0021b (promotion épistémique), ADR 0044 (autorité et gates)
  - `../../shared/operationContracts.v1.json` (schémas)
  - `../../backend/src/services/operationContractService.js` (validation)
  - `../../backend/tests/test_operation_contracts.js` (contrats + reprise)

## Contexte

L'ADR 0161 fige l'identité biologique Rust/Node. Il reste à figer le socle
opérationnel commun aux six chantiers : signalisation, workflows, perception
Web, contrôleurs Biome/Rhizome, Trinity et Morphogenèse parlent chacun
d'états, de reprises et de budgets sans sémantique partagée.

## Décision

1. États terminaux fermés : `complete`, `partial`, `unavailable`, `failed`
   avec `reason` obligatoire sauf `complete` ; transitions documentées dans
   le schéma partagé.
2. Corrélation obligatoire `missionId`, `runId`, `operationId`, `eventId` ;
   optionnels `branchId`, `agentId`, `proofId`. Le couple
   (`operationId`, `eventId`) + `idempotencyKey` porte la reprise sans double
   effet.
3. Enveloppe typée `operationKind` : `signal`, `workflow`, `perception`,
   `topology`, `trinity`, avec budget, autorité (demandeur + leases) et
   politique de retry/compensation déclarés avant exécution.
4. Reçu d'exécution : observé, demandé, constaté, origine (`simulated`,
   `local`, `external`). Un reçu `simulated` ne promeut rien.
5. Preuve à dimensions : nom, valeur, direction, seuil, incertitude,
   provenance. Une dimension manquante reste `unknown`, jamais inventée.
6. Traçabilité : `lineageKey` = `mission/run/operation/event` de la demande
   à la vérification ou au rejet.

## Conséquences

- Positives : suivi bout en bout sans perte de statut ni de provenance ;
  gates inchangées mais alimentées en preuves typées ; base des étapes 1 à 6.
- Négatives : corrélation complète exigée à chaque appel ; migration
  progressive des anciens émetteurs.
- Neutres : complète l'ADR 0161 sans le modifier ; périmètre Node en
  premier.

## Alternatives

- **Sémantique par chantier** : rejetée — preuves non comparables.
- **Étendre le contrat bio** : rejetée — mélange identité biologique et
  socle opérationnel.
