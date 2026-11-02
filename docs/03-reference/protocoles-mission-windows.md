# Entrée Windows locale et protocoles de mission

`backend/bin/orchestratorWindowsLocalExecution.cjs` utilise les adaptateurs
`missionProtocols/windows.js` et `windowsBudget.js` avant d'appeler le worker
local. L'exécution reste dans le processus pour éviter les erreurs de pipes
Windows ; elle ne contourne plus les barrières du runtime de mission.

## Préparation et scellement

Le contexte est construit depuis l'agent, son workspace et son vrai contrat
persistés. Le chemin demandé doit correspondre au chemin canonique enregistré
dans `workspaces.path`. Un ID de workspace ou un tenant correct ne permet pas
de sceller un autre répertoire.

Un vrai `strategy_execution_run` est créé et lié à la mission. Le scope de
budget modèle, la mission complète, sa politique, les commandes autorisées et
les limites effectives sont fixés avant le scellement. Les préparations SYNAPSE
et ALLOSTASIE sont réellement appelées. Un GQWF explicitement demandé conserve
la préparation native de workspace pour les workers concernés.

L'enveloppe scelle cette mission effectivement transmise au worker, avec le
module d'exécution local mesuré. Puis `runtime.initialize` conserve le binding
et initialise CONTINUITY. Avant le callback worker, `runtime.beforeExecution`
recontrôle l'autorité, le contexte SYNAPSE et l'admission ALLOSTASIE. Le contrôle
natif `assertRun` vérifie aussi le contenu d'entrée et l'exécutable mesuré.

## Budget parent commun

Pour un roster, le régulateur parent possède d'abord un vrai run et un seul
scope modèle natif. Ce scope est transmis à la création des workers puis à
chaque mission enfant. Un worker ne reçoit plus une nouvelle capacité parent
indépendante simplement parce qu'il possède un autre run.

L'adaptateur relit les plafonds et le propriétaire du scope dans
`mission_model_budget_scopes`, vérifie sa liaison native à la même mission et
son tenant, et utilise `missionModelBudgetScope.routeBudget`. Les limites d'un
enfant ne peuvent pas dépasser celles de son parent. Le plafond zéro demandé
reste zéro dans le scope modèle ; aucun défaut de budget Windows ne le remplace
par une nouvelle dotation. Les plafonds de requête du worker sont également
bornés à son allocation de tokens.

## Écriture, finalisation et refus

Le worker reçoit le vrai identifiant de run et la référence d'autorité scellée.
Ses écritures de progression et ses inférences retrouvent ainsi les bindings
CONTINUITY, EVIDENCE et OMEGA habituels. Un callback déclaré terminé ne constitue
pas à lui seul une preuve de complétion native.

`runtime.runInProcess` entoure l'appel réel. Sa finalisation GQWF et son
règlement ALLOSTASIE restent exécutés après un résultat non résolu ou une
exception. Les erreurs de préparation ou d'autorité se propagent ; les runs
créés qui échouent sont conservés comme tels. Aucun `catch` ne les transforme
en exécution `local-direct` sans autorité.

Les tests de harnais sans DB peuvent passer explicitement
`dependencies.testHarness:true`. Ce mode est refusé sur une connexion DB réelle
et ne peut pas être activé par le contenu de la requête de mission. Il ne
produit aucune affirmation de scellement ou de vérification protocolaire.

## Vérification

```text
node backend/tests/test_mission_protocols_windows.js
node backend/tests/test_mission_protocols_windows_roster.js
node backend/tests/test_orchestrator_windows_local_execution.cjs
```

Les deux premières suites utilisent une vraie DB SQLite et les vrais contrats,
scopes, enveloppes et protocoles. Leurs callbacks de test lisent les barrières
installées et ne contactent aucun modèle. Une opération OMEGA native est
réellement exécutée ; une complétion EVIDENCE sans preuve reste refusée. Le
roster vérifie l'application SYNAPSE, les expositions ALLOSTASIE avant appel et
leur règlement final mesuré. Les refus couvrent aussi un root étranger, une
autorité révoquée, un contrat absent et la tentative de harnais sur vraie DB.

Ces tests valident cette entrée locale et ses frontières. Ils ne constituent
pas une qualification de production de tous les fournisseurs de modèles ou
des adaptateurs de processus Windows.
