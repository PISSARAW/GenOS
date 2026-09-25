# Apprentissage longitudinal A-Team

Le debrief A-Team est persisté sous le topology id `a_team_learning`, avec un identifiant
stable dérivé du run. Un même run ne produit qu'un debrief ; une reprise après panne
complète le lien `execution.debriefId` sans créer une seconde entrée.

## Conditions d'enregistrement

`persistTeamDebrief` accepte seulement un run terminal (`COMPLETED`, `FAILED`, `BLOCKED`
ou `CANCELLED`). Les leçons marquées réutilisables sont conservées comme telles seulement
si leur référence figure dans les preuves du debrief et si l'adaptateur
`evidenceIsUsable` confirme cette preuve. Les résultats individuels des membres suivent
la même règle de provenance.

À la barrière d'intégration, une A-Team avec tous ses artefacts et handoffs vérifiés passe
à `COMPLETED` puis enregistre son debrief. Les références proviennent des rapports de
preuve des workers. Un échec d'écriture génère un événement d'avertissement et ne change
pas la décision de promotion des preuves.

## Utilisation pour les missions futures

`learningProfile` retourne les statistiques par profil de tâche, les leçons de staffing
réutilisables et les taux de réussite par worker dont les résultats sont sourcés. Le
planificateur de formation et les planificateurs RECRUIT/REPLACE peuvent recevoir ces
`candidatePriors`; ils les injectent dans le facteur historique du score candidat. Sans
échantillon vérifié, le score historique conserve son prior neutre.

Lorsqu'une CI prépare une réparation et reçoit l'adaptateur `findAteamExperts`, elle
interroge d'abord la mémoire transactive pour le premier gap. Un expert frais déjà dans
l'équipe laisse le plan normal de réparation s'appliquer. Un expert frais externe produit
un plan `CONSULT` avec le routage et les références de connaissance ; aucun recrutement
n'est lancé par cette décision. Sans expert frais, le plan REASSIGN/RECRUIT/REPLACE suit
son chemin normal. Sans adaptateur, le comportement historique reste disponible.
