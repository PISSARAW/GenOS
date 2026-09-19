# Audit des affirmations opérationnelles

- **Revue** : 2026-09-19
- **Portée** : références opérationnelles des familles API, MCP, intégrations, sécurité, persistance et reprise ; vérification structurelle de tous les liens Markdown relatifs.
- **Nature** : audit de cohérence code/documentation, pas certification de sécurité ni campagne E2E exhaustive.

## Résultat

Les chemins Markdown relatifs des 136 documents sous `docs/` ont été contrôlés ;
une cible absente a été corrigée dans `biomimicry-handlers.md`. Le contrôle ne couvre
pas chaque chemin écrit en code inline ni les liens externes.

Un rapprochement statique des déclarations de route (`router.get/post/...`) et des
fichiers de test trouve une chaîne exacte ou un chemin correspondant pour 110 des
341 déclarations extraites ; 231 n'ont pas de correspondance littérale dans les
fichiers de test. Cela ne prouve pas que les autres routes sont défectueuses : les
tests peuvent passer par des helpers, des préfixes ou des appels directs de
contrôleur. En revanche, le dépôt ne fournit pas de matrice automatique
route→contrat→test qui permette de les attester.
Les nombres sont des résultats d'extraction regex, pas un inventaire normatif.

| Domaine vérifié | Source et observation | Ce que les preuves couvrent | Limite qui reste |
| --- | --- | --- | --- |
| REST | `backend/src/app.js` monte des modules sous `/api`; une extraction des sources de route a relevé 341 déclarations littérales. | Les tests backend couvrent plusieurs parcours d'API, dont health, MCP, proof, workspace, IDE, auth et télémétrie. | Pas de test nommé pour chaque route ni de catalogue généré permission/scope/réponse. Les tableaux de familles ne valent pas liste exhaustive. |
| gRPC | 41 déclarations `service` dans `backend/proto`; `McpService` expose `EvaluateGating`. | Tests gRPC vérifient les RPC ciblés et le mapper d'erreurs. | Le nombre de services n'est pas le nombre de RPC démontrés ; chaque RPC doit avoir un cas nominal et refus testés. |
| SSE télémétrie | `GET /api/telemetry/stream` et `GET /api/telemetry` montés par `telemetryRoutes`, traités par `streamSSE`. | Le handler envoie un handshake, jusqu'à dix événements récents, puis ajoute le client au service SSE ; route tenant-scoped avec permission `telemetry:read`. | Le protocole ne garantit pas un événement `evidence_barrier` ou `complete` à chaque mission. L'ancien chemin `/api/events` a été retiré de l'exemple API. |
| Catalogue MCP | `shared/toolDefinitions.json` contient 27 entrées ; le test backend `GET /api/tools` a observé 172 entrées runtime pendant `npm test`. Le runtime combine DB, stratégies et handlers biologiques. | Enforcement direct, parité minimale JS/Rust et délais sont ciblés par des tests dédiés ; les tests nomment 23 des 27 définitions partagées par correspondance littérale. | Les catalogues ne sont pas identiques. Les 172 outils runtime ne disposent pas chacun d'une preuve nominale/refus documentée. Une définition et un schéma publiés ne prouvent pas un handler correctement câblé. |
| Gating MCP | `biomimeticToolGatingService` est appelé depuis le RPC gRPC et depuis des helpers de contrat/lease. | Tests de calcul/gating couvrent des entrées lexicales ; l'autorisation d'appel reste dans les gardes MCP et le dispatch. | Le score lexical n'est ni une mesure biologique, ni une garantie anti-hallucination. L'exemple de l'API a été ramené à cette portée. |
| « docking » / cnidocyte | `validateStericOrSchema()` est défini dans `mcpContract.js`; aucun appel depuis le dispatch backend n'a été trouvé. `checkCnidocyteReflex()` recherche une liste fixe de signatures. | `test_cnidocyte_reflex_interception.js` teste le helper et des exemples synthétiques. `mcpArgumentValidation`, lease, registre et circuit breaker sont des contrôles distincts du dispatch. | Le test n'atteste ni validation de schéma par énergie libre, ni détection exhaustive d'injection. La documentation API précise maintenant que ce n'est pas une barrière d'autorisation. |
| IDE | Contrat `genos.ide/v1`, routes HTTP, gRPC VFS, contrôleur et persistance d'identité sont présents. | `test_ide_contract.js` couvre la règle de compatibilité ; tests de routes couvrent certains contrôles de scope. | Aucun package d'extension VS Code, plugin JetBrains ou adaptateur Antigravity n'est livré. Les identifiants supportés désignent les clients conformes, pas des produits IDE prêts à installer. |
| Sécurité | `app.js`, `auth.js`, `security.js`, routes MCP et contrôleurs appliquent des couches différentes selon l'entrée. | Les tests de validation, tenancy, MCP et auth vérifient des refus précis. | Aucun prédicat unique auth+tenant+permission+sanitizer+breaker ne protège uniformément chaque action. La formule universelle a été retirée de la référence sécurité. |
| Persistance | SQLite/WAL, migrations, colonnes JSON et BLOB optionnelles sont présentes. Le script `migrate_msgpack.js` déclenche une migration explicite. | `test_biopolymer_blobs_migration.js` vérifie encodage/décodage, conversion d'une fixture et idempotence sur SQLite en mémoire. | Pas de preuve de réduction 15–40 % généralisable, de gain de latence ou de migration sans interruption en production ; ces formulations ont été corrigées. Les termes biologiques restent des noms logiciels. |
| Jobs et reprise | `jobWorker`, `workerFailureRecoveryService`, `agentRecoveryService`, snapshots et bisection sont présents. | Suites recovery et tests de snapshots couvrent des cas de retry, d'état et de rollback. | Une reprise de job ne garantit pas l'exécution exactement une fois d'un effet externe ; un provider peut réussir avant un crash local. La persistance de job ne reconstitue pas tous les états en mémoire. |
| Services philosophiques | Le registre expose une maturité par adaptateur et des tests de santé du registre. | Des tests dédiés vérifient des analyses bornées et entrées invalides pour plusieurs services. | La santé du registre ne prouve pas chaque théorie ni l'exactitude des interprétations. Les concepts sans service exécutable restent hors contrat runtime. |

## Exécutions de validation pendant cette revue

| Commande | Résultat observé | Portée |
| --- | --- | --- |
| `npm --prefix backend run test:mcp` | Passe : 6 suites | catalogue, schémas, permission/scope, transports HTTP explicite, parité minimale. |
| `npm --prefix backend run test:recovery` | Passe : 3 suites | récupération worker, bisection causale et reconnexion d'exécution. |
| `npm --prefix backend run test:security` | Échec : 3/4 sous-suites ; verdict runner `SECURITY VULNERABILITY DETECTED` | un sous-test CORS/CSRF lève `TypeError` sur `undefined.code`; le probe concurrence termine par `ETIMEDOUT`/`ECONNREFUSED`. Les assertions RBAC, barrière 42/42 et tests adversariaux de base passent. Ce résultat signale un échec de suite, pas une vulnérabilité confirmée sans diagnostic. |
| `npm --prefix backend run test:grpc` | Échec | 41 descripteurs proto chargés et plusieurs services passent ; l'étape Agent/Orchestrator échoue à `AgentService.StartMission` (`false !== true`, `test_grpc_services.js:301`). Cause non déterminée par cet audit. |
| `node backend/tests/test_ide_contract.js` | Passe | compatibilité de version du contrat IDE. |
| `node backend/tests/test_biopolymer_blobs_migration.js` | Passe | fixture 103→88 octets (14,56 %), migration/idempotence SQLite en mémoire. Ce seul objet ne justifie pas le taux généralisé précédemment annoncé. |
| `node backend/tests/test_mcp_direct_call_enforcement.js` | Passe | lease et liste d'outils désactivés sur les cas du test. |

## Corrections apportées pendant l'audit

- Retrait de l'exemple SSE inventé `/api/events`; documentation du chemin réel et
  de ses événements garantis.
- Requalification des heuristiques de gating et de docking ; suppression des
  promesses d'absence d'hallucination, de sécurité par signature ou de mesure
  physiologique.
- Distinction entre codec MessagePack en mémoire et colonnes BLOB/migration SQLite.
- Réduction des affirmations de compression et de migration sans interruption aux
  résultats effectivement couverts par le test de fixture.
- Retrait de la règle de sécurité universelle et clarification que les contrôles
  sont appliqués selon la surface.
- Reformulation de l'apoptose en termes d'arrêt/nettoyage logiciel vérifiable.
- Correction d'un lien Markdown local cassé.

## Critères de clôture d'un audit opérationnel

Une route, un outil ou un service peut être déclaré couvert quand sa fiche relie
son nom canonique au handler effectivement monté, au contrôle d'accès/scope, au
schéma de requête/réponse, à un test nominal, à un test de refus et aux effets
persistés. Pour les familles nombreuses, générer l'inventaire depuis les registres
de runtime et faire échouer la CI si une entrée n'a ni handler ni tests ciblés.
Tant que cette matrice n'existe pas, les lignes sans preuve dédiée doivent rester
« partiel » ou « expérimental » dans le [contrat de complétude](../03-reference/contrat-produit-et-completude.md).
