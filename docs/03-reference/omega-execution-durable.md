# OMEGA Execution — Exécution durable du runtime existant

- **Statut** : Profil Node intégrable, exécutant le vrai runtime G-CIR Ω et son journal SQLite.
- **Dernière revue** : 2026-11-02

## API et plan accepté

`OmegaExecution`, exportée par
`backend/src/services/omegaProtocol/execution.js`, reçoit
`{dbPath,authorize,resolvePlan,describeRuntime,currentContext,handlers,effectGate,clock}`.
Les callbacks `authorize`, `resolvePlan`, `describeRuntime` et `currentContext`
sont obligatoires. La base SQLite utilise WAL ; sans `dbPath`, elle est en
mémoire et ne fournit pas de reprise après arrêt du processus.

| Méthode | Résultat |
| --- | --- |
| `apply(message)` | Exécute `EXECUTE`, `RESUME` ou `REPORT_OBLIGATIONS` |
| `state({scope,missionId,conversationId,runId})` | Copie de l'état durable du run |
| `history()` | Messages et résultats journalisés |
| `close()` | Ferme la connexion SQLite |

Le payload des trois commandes porte
`{runId,planId,planDigest,baseDigest,environmentDigest}`. L'émetteur ne transmet
ni résultats préfabriqués, ni fonctions, ni gestionnaires d'outils exécutables.
`resolvePlan({scope,missionId,conversationId,planId,planDigest})` doit retrouver
le plan accepté auprès de l'autorité d'admission, par exemple via
`OmegaAdmission.acceptedPlan`. Une requête d'exécution seule ne vaut pas
acceptation du programme.

Le résolveur retourne l'état accepté complet : `status`, `plan`, `program`,
`submission`, `capabilities` et `context`. Le contexte lie portée, mission,
conversation, acteurs, générations, autorité et expiration. Le bridge vérifie
les digests du plan, du programme natif et du contexte, les obligations exactes
du programme, puis compare l'autorité, les acteurs et les générations de la
commande. Le budget des effets est celui de `plan.budget`, immuable après
admission ; un appelant ne peut pas réapprovisionner un run en le reprenant.

## Fraîcheur et capacités effectivement installées

`currentContext({message,plan})` doit consulter l'état réel et retourner
exactement `{baseDigest,environmentDigest,generations}`. Une base ou un
environnement seulement répété depuis le message ne fournit pas ce contrôle.
`describeRuntime({message,stage:"EXECUTE"})` retourne les capacités effectives
du runtime installé, dont le digest doit encore correspondre au plan accepté.

Ces vérifications, la résolution du plan, l'autorisation et l'expiration sont
contrôlées au début de chaque commande et autour de chaque gestionnaire appelé.
Une révocation après un callback empêche de confirmer son résultat. Les
paramètres remis aux callbacks sont des copies profondément gelées. Les
adaptateurs externes restent responsables d'une observation cohérente de leur
état et du fencing à l'endroit où leurs effets sont appliqués.
La dernière lecture de capacités suit la dernière lecture du contexte. Ces
observations successives ne forment pas une transaction entre services : le
gestionnaire modèle doit aussi faire respecter la génération de runtime au
point d'admission de son appel d'inférence.

Les gestionnaires sont installés localement dans
`handlers:[{kind,reference,pure,handle}]`. `READ`, `SELECT` et `CHECK` exigent
`pure:true`, une garantie de l'intégrateur permettant leur reprise sans effet
mutant. `INFER` exige un vrai gestionnaire modèle installé ; annoncer une
capacité dans le descriptif sans installer le gestionnaire ne suffit pas.
`CALL` et `EMIT` utilisent des déclarations de référence et passent exclusivement
par `effectGate.effect` ; leurs éventuels gestionnaires directs ne sont pas
appelés par le bridge.

Le programme accepté contient des requêtes bornées par opération :

| Opération | Requête dans `program.payload.requests[operationId]` |
| --- | --- |
| `READ` | `{objectId}` |
| `SELECT` | `{fields}` |
| `CHECK` | `{predicate}` |
| `INFER` | `{instruction}` |
| `CALL`, `EMIT` | `{resourceId,action,cost}` |

Un gestionnaire pur reçoit `{request,context,input,candidate}`. `input` et
`candidate` sont issus des dépendances réellement exécutées par le runtime,
sans remplacement par une valeur fournie dans le payload de la commande.
Le lecteur résout `objectId` dans la source de confiance autorisée.

## Bridge du runtime G-CIR Ω

`runtimeAdapter.js` appelle réellement
`cognitiveOmegaRuntimeService.createRuntime({journal})`. Le journal existant
`cognitiveOmegaExecutionJournal` reste utilisé avec les tables
`cognitive_omega_runs` et `cognitive_omega_operations`. Un adaptateur asynchrone
sur `better-sqlite3` fournit ses méthodes `exec`, `get` et `run` sans remplacer
la sémantique du runtime.

Le bridge associe une référence interne déterministe à chaque opération pour
retrouver sa requête exacte, même si plusieurs opérations utilisent le même
lecteur. Il vérifie **avant cette association** que la référence originale est
autorisée par `program.policy`. Une capacité disponible n'accorde donc aucun
droit absent de la politique. L'autorisation de l'intégrateur reste nécessaire
en plus de cette politique native.

Le contrôle `CHECK → EMIT` est celui du vrai `cognitiveOmegaProofBinding` :
`EMIT` doit consommer exactement le candidat vérifié, avec les reçus des
vérifications dont il dépend. La gate d'effet contrôle ensuite indépendamment
l'applicabilité de cette preuve, la cible, l'autorité, les générations et le
budget avant tout effet externe.

Un programme `READ → SELECT → CHECK → EMIT` sans opération `INFER` ne déclenche
aucun appel modèle. Les opérations déjà achevées sont relues depuis le journal
sans réappeler leurs gestionnaires. Le mot `emitted` est le statut final
historique du runtime même pour un programme sans `EMIT` ; le bridge expose
`completed` pour signifier que les opérations demandées se sont terminées,
sans prétendre qu'un effet ou une vérification absente du programme a eu lieu.

## Effets, intentions et issue inconnue

Chaque effet est lié à une clé calculée sur
`{scope,missionId,conversationId,runId,planDigest,stepId}`. Sa requête complète
porte aussi les digests du programme, des capacités et de la politique, la
base, l'environnement, le runtime et sa génération, l'acteur, l'autorité,
le budget admis, la cible, le coût, le candidat exact et son reçu de preuve.
Cette requête est conservée avant l'appel de la gate et reste identique pendant
la reprise. L'expiration provient du contexte admis et n'est pas prolongée par
un nouveau message `RESUME`.

Le wrapper exige un reçu `completed` dont toute la structure et le digest sont
valides pour cette requête. Un résultat modifié ou un faux digest ne constitue
pas une confirmation. L'intention et les reçus locaux sont conservés à part du
journal natif pour permettre leur inspection après un arrêt.

Le runtime natif inscrit l'opération `running` avant le gestionnaire. Si la
gate retourne `effect_outcome_unknown`, le wrapper lève une erreur : il ne
retourne pas un résultat fictif que le journal pourrait mémoriser comme achevé.
Une réponse perdue après application distante reste donc une issue inconnue.
La gate doit réconcilier cette intention avec le reçu durable du destinataire
avant que `RESUME` puisse terminer le run. Tant que la gate ne possède pas ce
reçu, le wrapper n'autorise aucune nouvelle distribution implicite de l'effet.

L'enregistrement natif `{idempotent:true}` décrit ici la réentrée sûre dans le
wrapper de gate, qui retrouve l'intention et son état. Il n'affirme pas qu'un
service externe arbitraire déduplique les effets. Cette dernière garantie
requiert le journal et le comportement réels du destinataire, ou une
réconciliation de confiance qui établit l'absence d'effet.

## Reprise et rapport d'obligations

Les identifiants natifs des runs sont dérivés de la portée, de la mission,
de la conversation et du `runId`. Réutiliser un run avec un autre plan échoue,
y compris pour `REPORT_OBLIGATIONS`. Un message exact déjà journalisé retourne
son résultat initial. Une commande `RESUME` explicite est nécessaire pour un
run interrompu ; l'autorisation doit aussi vérifier qu'une ancienne instance
d'exécution n'est plus habilitée à poursuivre le travail.
Le propriétaire local du run est contrôlé avant et après les vérifications
asynchrones : une instance remplacée pendant ces appels ne peut pas démarrer
son ancien gestionnaire lorsque son attente se termine.

Les opérations pures `READ`, `SELECT` et `CHECK` restées `running` peuvent être
réexécutées sur la même source encore applicable. Une opération `INFER` restée
`running` bloque la reprise avec `INFERENCE_OUTCOME_UNKNOWN` : une inférence
peut déjà avoir été facturée, et le bridge ne suppose pas sa déduplication.
La récupération de son résultat nécessite une procédure de confiance ; aucune
sortie fournie librement par l'appelant n'est injectée dans le journal.

`REPORT_OBLIGATIONS` conserve toutes les obligations du plan dans leur état
admis `open`, puis ajoute séparément `executionStatus`, `outcome` et le digest
du reçu observé. Une intention `CALL` ou `EMIT` sans reçu local est indiquée
comme `effect_outcome_unknown`. Une inférence interrompue est indiquée comme
`inference_outcome_unknown`. Un effet confirmé dont l'écriture finale du journal
natif manque reste distingué par `effect_completed_journal_pending`.

Une vérification rejetée produit une opération native bloquée, mémorisée comme
telle. Le bridge ne réécrit pas ce rejet pour réessayer artificiellement le
même run. Une nouvelle tentative justifiée exige un nouveau run et, si les
conditions changent, une nouvelle admission.

## Limites et validation

Cette bibliothèque ne configure pas automatiquement de réseau, de route HTTP,
de lease MCP ou de permission de production. Ses méthodes de lecture supposent
un intégrateur de confiance ; elles ne doivent pas être exposées directement
comme une API multi-tenant sans contrôles de portée et d'accès. Les handlers
et leurs déclarations de pureté doivent être installés par l'opérateur.

```text
node backend/tests/test_omega_protocol_execution.js
node backend/tests/test_omega_protocol_execution_safety.js
```

Les suites exécutent le vrai runtime et son journal, vérifient l'absence
d'inférence implicite, la reprise depuis les étapes achevées, les politiques
natives, les reçus falsifiés, la fraîcheur, les générations, l'autorité et la
conservation des obligations. Leurs gates contrôlées isolent le comportement
du bridge ; le démonstrateur multiprocessus mesure séparément la gate et son
destinataire réel, notamment l'arrêt après effet avant reçu local.
