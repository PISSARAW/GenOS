# Adoption des actions signées d'un run scellé

L'entrée `missionActionRuntimeService.run` adopte désormais le run avant de
réserver et d'exécuter une action active dont la signature est acceptée. Le profil
persisté est `adopted-sealed-action`. L'adoption ne crée aucune enveloppe : elle
exige l'enveloppe native signée existante, son budget GVX exact, son agent, sa
mission active, son workspace et son autorité toujours valides. Un run ancien
est refusé dès qu'une incarnation plus récente de cet agent existe.

`missionProtocols/actions.adopt` initialise le runtime commun et la première
autorité CONTINUITY sous transaction de contrôle. Une adoption répétée relit
l'autorité déjà installée et ne remet pas le fence à zéro. Les inférences passent
ensuite réellement par OMEGA et le routeur natif ; elles conservent les réservations
et règlements modèle ainsi que les quotes de l'action. Leur résultat reste
`executed_unverified` et n'est pas une complétion de mission.

Ce profil hérité ne reconstruit pas de prompt original absent du sceau, de pair
SYNAPSE, ni d'exposition temporelle ALLOSTASIE. Ces informations ne peuvent pas
être déduites d'une action isolée. Les sept protocoles du cycle `startMission`
restent le profil complet ; l'adoption des actions explicite la borne de cette
autre entrée au lieu de prétendre rejouer un démarrage qui n'a pas eu lieu.
Les actions shadow restent des décisions sans exécution et n'adoptent aucun run.
Une action active sur un run non scellé est refusée ; aucun fallback legacy
n'exécute une mission active sans autorité native.

Validation : `node backend/tests/test_mission_action_runtime.js` et
`node backend/tests/test_mission_protocols_actions.js`. La seconde suite utilise
un fournisseur HTTP local réel, un run scellé natif et les vrais journaux de
réservation OMEGA/modèle, sans substituer un validateur de provenance.
