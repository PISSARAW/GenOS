# ADR 0444 — Exécution attestée du contrôleur de mission

- **Statut** : Accepté pour une activation pilote explicite.
- **Date** : 2026-10-12.
- **Domaine** : Décision économique, provenance et exécution de mission.
- **Lié à** : [ADR 0436](0436-controleur-commun-decision-shadow.md), [ADR 0431](0431-reservation-atomique-des-budgets-modele.md), [ADR 0420](0420-contrat-issue-mission.md).

## Contexte

Le contrôleur compare les actions mais renvoyait toujours `executable: false`.
Les appels de mission n'avaient aucun point d'entrée qui applique son choix.
Une action fournie dans une requête ne constitue pas une autorité ni une
mesure de calibration.

## Décision

L'action explicite `execute_mission_action` de `genos-orchestrate.cjs` passe par
`orchestratorActions` et `missionActionRuntimeService`. Le service charge le
contrat `mission_outcome` et les plafonds du `strategy_execution_run` persisté.
Il retranche les métriques déjà enregistrées et les réservations du journal,
puis soumet les candidats au contrôleur. Une décision shadow est journalisée.
En mode actif, les poids de classement sont fixés côté serveur ; une requête
ne peut pas changer la préférence économique.

Le mode actif exige simultanément `decision.mode = "active"`,
`GENOS_MISSION_ACTION_ACTIVE=1`, une clé serveur
`GENOS_MISSION_ACTION_ATTESTATION_KEY` d'au moins 32 octets, une liaison GVX
mission↔run valide et une attestation HMAC SHA-256 non expirée pour chaque
action admissible. L'attestation couvre le run, la mission, le contrat,
l'identité et le genre de l'action, ses obligations couvertes, son devis
complet, ses prérequis, ses arguments d'exécution et sa calibration. La clé
reste côté serveur. La signature prouve l'autorité de l'émetteur configuré ;
elle ne prouve pas à elle seule que son échantillon de calibration est bon.

La réservation de l'action sélectionnée est atomique dans
`mission_action_decisions`. Elle précède l'appel et empêche un second appel
de la même action pour ce run. Le journal conserve le choix, les alternatives,
le plafond réservé, un statut et l'empreinte du résultat. Les réservations
restent comptées après l'appel, y compris quand son résultat est incertain.
L'exécution pilotée admet les modèles via `modelRouter.generate`, avec scope
GVX, `executionRunId` et `routeActionId` propagés au journal des tentatives.
Pour les outils, seuls `uncertainty_gate` et `active_refusal`, primitives
locales sans effet externe, sont autorisés. Les procédures, délégations et
vérifications continuent d'être classées mais n'ont pas d'exécuteur actif.

Le retour `executed_unverified` signifie seulement que l'appel est revenu.
Il ne certifie jamais l'obligation ni l'issue de mission. Toute promotion
requiert encore le contrôle indépendant du contrat et des preuves AEIS.

## Limites

L'activation dépend d'un émetteur de reçus de calibration hors échantillon
administré séparément. Les coûts des outils sont plafonnés par admission et
réservation ; cette tranche n'interrompt pas un outil qui dépasse sa durée.
La preuve GVX est exigée uniquement en actif : les missions sans scope
organisation/projet restent en shadow. Les tests de modèle remplacent le
fournisseur externe par un double et ne mesurent pas d'économie de tokens.

## Vérification

`node backend/tests/test_mission_action_runtime.js` traverse l'entrée de
mission, la décision, le journal, une primitive réelle et un routage modèle
simulé ; il teste aussi l'altération d'une attestation, l'absence de liaison
GVX et le refus d'un second appel.
