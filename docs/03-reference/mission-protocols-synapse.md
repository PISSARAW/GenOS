# SYNAPSE dans le contexte exécuté des workers

`missionProtocols/synapse.prepare(ctx)` est appelé après création du run, avant
le scellement de son enveloppe. Il charge le parent réel du worker, sa portée
et son dernier run. Sans parent, il utilise l'orchestrateur réel de la mission.
Le publisher et le receiver doivent être deux agents logiques distincts : une
mission seule retourne explicitement `not_applicable/single_logical_participant`.
Aucun agent factice ni acquittement synthétique n'est créé pour ce cas.

Le pont installe les deux opérations locales `put/remove`, leur schéma de
payload et leur sens complet via `dialectService`. `commonGroundService`
conserve la connaissance de ce contrat logiciel installé ; ce grounding ne
prétend pas établir la vérité du contenu de la tâche. Le contexte lie le run,
la mission, l'autorité, le publisher, l'audience, le schéma, le dictionnaire
complet et la base vide exacte. Une opération bornée met la tâche dans le
document du worker via `DECLARE_CONTEXT → OFFER_DELTA → APPLY_DELTA` et produit
un vrai reçu `state_applied` et un `ACK_STATE` durable en outbox.

La valeur relue du document génération 1 devient `normalizedMission.prompt`,
consommé par les chemins réels de supervision et d'exécution des workers.
`normalizedMission.synapseContext` conserve les références de cet état avant le
scellement. La vérification `beforeExecution(binding)` relit le document, son
historique, le reçu natif et la signification du dictionnaire. Une nouvelle
incarnation du parent, un changement de tâche, de base, de tenant, de sens ou
d'autorité refuse le dispatch et demande une nouvelle préparation explicite.

Le transport compact n'est pas une permission d'action. La version présente
exécute le pont local avec les vrais services de communication SQLite ; elle
n'installe ni authentification réseau ni synchronisation distribuée. La feuille
sans second agent reste hors de la conversation SYNAPSE, conformément au
contrat portable qui exige deux participants distincts.

Validation : `node backend/tests/test_mission_protocols_synapse.js`.
