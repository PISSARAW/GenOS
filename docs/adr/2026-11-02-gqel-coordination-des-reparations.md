# ADR — Coordination native des réparations de qualité GQEL

- Date : 2026-11-02
- Statut : implémenté dans le parcours A-Team décrit ici
- Portée : contrats des membres, ordonnanceur de dépendances et retour à l'orchestrateur

## Contexte

Une obligation A-Team `pending_repair` décrivait un refus sans déclencher de
réparation. Relancer un worker sans rattachement à ses critères, à son budget et
à son identité pouvait aussi libérer un consommateur sur une ancienne preuve.

## Décision

Les contrats GQEL compilés et leurs routes sont conservés dans les membres
canoniques du TeamRun, dans leur empreinte de formation et dans les charges de
lancement. Une divergence entre le contrat du plan et celui du membre persistant
refuse la coordination.

L'observation A-Team reconnaît les critères d'acceptation manquants qui figurent
explicitement dans le contrat GQEL du membre. Elle réserve une tentative dans
`execution.qualityRepairs` avant d'appeler le lanceur natif existant. La requête
`qualityRepair` contient l'identité de l'équipe et du membre, le numéro de
tentative, l'empreinte du candidat précédent et les critères non vérifiés. Elle
n'accorde aucune permission supplémentaire et ne modifie pas le contrat initial.
Les appels modèles restent soumis au routage et au budget partagé de la mission.

Le nombre de relances externes est borné par `min(maxStrategyMutations, 2)`.
Chaque boucle interne conserve également ses plafonds propres et consomme le
budget partagé. L'expiration de la mission ou l'annulation bloque la relance.
Les diagnostics natifs `needs_review` et `stagnated` ne relancent pas une boucle
déjà arrêtée ; ils remontent à l'orchestrateur avec leur catégorie qualité,
budget, autorité, infrastructure ou annulation.

Une réparation en cours conserve le producteur dans l'état d'ordonnancement
`repairing`. Aucun consommateur ne peut démarrer sur le rapport précédent. La
réouverture exige un nouveau rapport portant un contenu différent et accepté
par les validateurs de preuves habituels. Un rapport modifié avec le même
artefact est classé stagnant, même s'il déclare désormais ses critères réussis.
Les reçus de transmission sont recalculés par le parcours existant sur le nouvel
artefact. Un simple lancement réussi n'est jamais une validation.

Les tentatives et diagnostics sont persistés dans le TeamRun et renvoyés dans
le résultat d'exécution et son dossier d'intégration. Une reprise observe une
tentative réservée sans la redispatcher automatiquement : en cas d'incertitude
après interruption, la porte reste fermée jusqu'à preuve fraîche ou expiration.

## Vérification et limites

`node backend/tests/test_ateam_gqel_coordination.cjs` couvre un lancement différé,
la validation du nouvel artefact avant transmission, la stagnation, le plafond
des réparations, le budget partagé refusé par le runtime, l'autorité, l'annulation
et la conservation du contrat. Les rapports modèles de ces tests sont
synthétiques ; leurs sondes de calcul exécutent un processus Node réel.

La coordination ne remplace ni l'évaluation GQEL, ni les reçus authentifiés du
runtime, ni les portes de clôture et de promotion de la mission. Elle ne modifie
pas la topologie ni le modèle et ne répare pas les erreurs de permissions ou
d'infrastructure comme s'il s'agissait de défauts rédactionnels.
