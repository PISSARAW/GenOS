# SYNAPSE dans le contexte exécuté des workers

`missionProtocols/synapse.prepare(ctx)` est appelé après création du run, avant
le scellement de son enveloppe. Il charge le parent réel du worker, sa portée
et son dernier run. Sans parent, il utilise l'orchestrateur réel de la mission.
Le publisher et le receiver doivent être deux agents logiques distincts : une
mission seule retourne explicitement `not_applicable/single_logical_participant`.
Aucun agent factice ni acquittement synthétique n'est créé pour ce cas.

Le publisher doit normalement appartenir à la même mission. Une mission enfant
Trinity native peut recevoir le contexte initial du run parent : son identifiant
doit correspondre exactement au parent et à son run GVX, son expérience et son
monde doivent être enregistrés, et les missions racine/enfant doivent avoir le
même orchestrateur et leurs membres réellement inscrits. Le design natif doit
également désigner cet orchestrateur. Le nom seul ou le même tenant ne suffit
pas. La conversation et les preuves du worker restent liées à la mission
enfant ; aucun oracle du parent n'est recopié ni renommé en preuve enfant.

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

Le banc `run_worker_compliance_mission.cjs` initialise lui aussi son vrai parent
de contrôle : mission et membres persistés, budget natif, incarnation GVX,
lease et enveloppe scellée sur le runner du banc. Son événement de démarrage
atteste le dispatch ; il n'affirme aucune réussite du parent. Le worker doit
toujours fournir ses propres artefacts et ses propres oracles pour réussir la
qualification `test_worker_compliance_native_missions.js`.

Dans le mode de code borné du banc, le contrôle est créé avant l'allocation
modèle. `missionModelBudgetScope.bindParent` inscrit son vrai `parent_run_id`
et ses plafonds avant le scellement ; aucun identifiant de parent synthétique
n'est admis. `test_worker_compliance_parent.js` vérifie ces écritures natives
et les refus d'une autre mission, d'un budget amplifié, d'un tenant ou d'un
workspace différent. Une réponse LLM ou un scope valide ne dispense toujours
pas des commandes autorisées, des tests exécutés et des postconditions.

Le banc de coopération initialise également le contrôleur réel de chaque
scénario avec sa mission, son budget, son run et son enveloppe native. Les huit
workers consomment le contexte publié par cette incarnation précise ; leurs
preuves et leurs résultats restent propres à leurs runs. Le contrôleur ne
reçoit aucune qualification de réussite par le seul démarrage du scénario.
