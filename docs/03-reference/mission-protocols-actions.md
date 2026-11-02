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

## Dispatch direct du CLI

Le CLI `dispatch_worker` prépare un véritable run de contrôle du parent dans
`directWorkerControlRun.cjs`, après attachement de la mission et de sa lease.
Ce run est créé avec le contrat, le workspace et le budget natifs, puis son
enveloppe signée mesure le point d'entrée CLI réellement utilisé. Le runtime
CONTINUITY est initialisé avant l'événement de démarrage du contrôle, puis le
worker reçoit cette incarnation réelle comme publisher SYNAPSE. Les workers
modèles conservent aussi leur scope partagé de réservation native.
Ce profil CLI refuse les scopes modèle fournis, y compris ceux d'une ancienne
incarnation de la même mission : son allocation est toujours liée au run de
contrôle qu'il vient réellement de créer. Les API générales de scopes restent
distinctes ; ce refus ne les remplace pas.

Le démarrage du contrôle n'est pas une réussite du parent. La fermeture déjà
utilisée par le dispatch marque ce run `cancelled` après réussite du worker,
avec une raison indiquant qu'aucune décision parent n'est établie ; un échec du
worker ferme le contrôle en échec. Les preuves indépendantes restent celles du
worker. Aucun parent fictif ni reçu de complétion ne remplace un run manquant.

Validation : `node backend/tests/test_direct_worker_control_run.cjs` et les
régressions réelles Syncytium/redémarrage biologique.
