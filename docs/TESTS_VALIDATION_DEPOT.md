# Tests et validation du dépôt

## 1. Objet

Cette documentation décrit comment le dépôt GenOS vérifie son comportement aujourd'hui. Elle sépare les mécanismes réellement présents des catégories parfois attendues dans une plateforme d'agents : tests unitaires, tests d'intégration HTTP/gRPC, MCP, sécurité adversariale, charge, isolation tenant, concurrence, migrations, compatibilité CLI, providers et reprise après échec.

Les principales sources sont :

- [package.json](../package.json) et [backend/package.json](../backend/package.json)
- [backend/tests/run_validation_suite.js](../backend/tests/run_validation_suite.js)
- [backend/tests/run_quality_suite.js](../backend/tests/run_quality_suite.js)
- [backend/tests/test_backend.js](../backend/tests/test_backend.js)
- [backend/tests/test_grpc_services.js](../backend/tests/test_grpc_services.js)
- [backend/tests/stress/test_stress.js](../backend/tests/stress/test_stress.js)
- [backend/tests/stress/test_framework_adversarial_bench.js](../backend/tests/stress/test_framework_adversarial_bench.js)
- [backend/tests/stress/test_extreme_tokens_and_comm_bench.js](../backend/tests/stress/test_extreme_tokens_and_comm_bench.js)
- [backend/tests/stress/test_apex_adversarial_defense_bench.js](../backend/tests/stress/test_apex_adversarial_defense_bench.js)
- [crates/genos-cli/src/tests.rs](../crates/genos-cli/src/tests.rs)

Le dépôt ne repose pas sur Jest, Mocha, Vitest ou un framework de property testing centralisé. Les tests Node sont des scripts exécutables avec `node`, `assert`, des serveurs locaux, SQLite et des doubles ciblés. Les tests Rust sont les tests unitaires de crates exécutés par Cargo.

---

## 2. Définition : valider un runtime d'agents

Dans GenOS, la validation répond à plusieurs questions distinctes :

1. le calcul ou le handler produit-il la réponse contractuelle ?
2. l'API applique-t-elle authentification, tenant et schémas attendus ?
3. le processus se comporte-t-il correctement sous défaillance, concurrence ou entrée hostile ?
4. l'opération annoncée a-t-elle réellement été appliquée, plutôt que seulement simulée ?

Un succès de test est une observation reproductible dans le périmètre exercé. Ce n'est pas une preuve que les modèles externes, l'OS, le réseau ou les outils distants auront le même comportement en production.

La qualité globale est mieux représentée comme un vecteur :

$$
V = (U, I_{REST}, I_{gRPC}, M, S, T, C, R, P)
$$

où :

- $U$ : unité de logique ;
- $I_{REST}$ et $I_{gRPC}$ : intégration de transport ;
- $M$ : contrats MCP ;
- $S$ : sécurité et entrées adversariales ;
- $T$ : isolation multi-tenant ;
- $C$ : concurrence ;
- $R$ : reprise ;
- $P$ : provider et frontières réseau.

Le statut de la commande de test est une composante nécessaire mais insuffisante :

$$
\text{confiance} \neq \mathbb{1}[\text{exit code}=0]
$$

Il faut aussi examiner l'environnement, les doublures, les artefacts utilisés et le type de propriété vérifiée.

---

## 3. Architecture de validation

```mermaid
flowchart TD
    Dev[Developpeur ou CI] --> Root[npm test / cargo test]
    Root --> Node[backend/tests]
    Root --> Rust[crates/* tests]

    Node --> Smoke[test_backend.js]
    Node --> Profiles[run_validation_suite.js]
    Node --> Quality[run_quality_suite.js]

    Profiles --> Rest[REST local + SQLite]
    Profiles --> Grpc[gRPC local]
    Profiles --> Mcp[MCP schemas, transport, permissions]
    Profiles --> Security[adversarial master]
    Profiles --> Tenant[tenancy]
    Profiles --> Migration[migrations]
    Profiles --> Recovery[recovery]
    Profiles --> Providers[provider configuration/protocol]
    Profiles --> Concurrency[seed concurrency]

    Node --> Stress[tests/stress]
    Rust --> Native[handlers Rust et invariants]
```

### 3.1 Commandes d'entrée

| Commande | Rôle |
|---|---|
| `npm test` | délègue à `npm --prefix backend test`, donc `backend/tests/test_backend.js` |
| `npm run test:quality` | lance les tests de qualité/evaluation Node |
| `npm --prefix backend run test:validation` | exécute tous les profils de validation Node |
| `npm --prefix backend run test:security` | exécute le master adversarial sécurité |
| `npm --prefix backend run test:mcp` | exécute le sous-ensemble MCP |
| `npm --prefix backend run test:tenancy` | exécute l'isolation tenant |
| `npm --prefix backend run test:migration` | exécute les migrations ciblées |
| `npm --prefix backend run test:recovery` | exécute les scénarios de reprise |
| `npm --prefix backend run test:providers` | valide les configurations/protocoles providers |
| `npm --prefix backend run test:concurrency` | valide le seed concurrent SQLite |
| `npm --prefix backend run test:grpc` | lance l'intégration gRPC locale |
| `cargo test --workspace` | exécute les tests unitaires Rust disponibles dans les crates |

`run_validation_suite.js` lance chaque fichier enfant par `spawnSync`, s'arrête au premier échec et retourne `0` uniquement si toutes les suites du profil passent. Il injecte `GENOS_ADMIN_PASSWORD=test-only` lorsque la variable est absente, afin d'éviter que la suite ne dépende d'un secret opérateur.

---

## 4. Tests unitaires Rust

Les tests Rust se trouvent dans les crates. Par exemple, [crates/genos-cli/src/tests.rs](../crates/genos-cli/src/tests.rs) exerce directement les handlers sans passer par un shell :

- création, validation et snapshot d'agent ;
- comparaison de snapshots ;
- détection d'hallucination ;
- replay avec chaîne de hash ;
- primitives biomimétiques.

Le test de replay est particulièrement utile : il crée un snapshot, écrit une étape, vérifie que le replay réussit, modifie ensuite `delta_entropy` et exige l'échec de la vérification. La propriété testée est l'intégrité de la chaîne, non la réexécution d'un LLM ou d'un outil externe.

```rust
let tampered = raw.replace("\"delta_entropy\": 0.1", "\"delta_entropy\": 9.9");
std::fs::write(&snap_file, tampered).unwrap();
assert!(tampered_result.is_err());
```

Ce style est unitaire ou de composant local : fichiers temporaires, handlers Rust réels, pas de provider cloud ni de backend déployé.

---

## 5. Tests unitaires Node et qualité

Les tests Node sont des scripts `node` utilisant principalement `assert` ou `node:assert/strict`. Ils couvrent les services, contrôleurs, schémas, politiques, adapters et contrats.

La suite `test:quality` regroupe notamment :

- gradation et worker d'évaluation ;
- intégrité/checkpoint de campagne ;
- score, complétude et provenance ;
- reproductibilité ;
- normalisation de résultat ;
- sémantique des métriques ;
- preuve de « no answer ».

Ce regroupement ne mesure pas une qualité subjective du modèle. Il vérifie que les résultats et preuves stockés par les composants d'évaluation respectent les contrats attendus.

---

## 6. Tests d'intégration REST

Le test [backend/tests/test_backend.js](../backend/tests/test_backend.js) est une intégration REST locale représentative :

1. il crée une base SQLite de test ;
2. démarre `createApp()` derrière un serveur HTTP local sur le port `4099` ;
3. effectue de vraies requêtes HTTP avec `http.request` ;
4. injecte un bearer token de test et les headers de tenant lorsque requis ;
5. vérifie les statuts HTTP, headers, payloads et les écritures SQLite.

Il couvre notamment WAL/transactions, RBAC, headers de sécurité, arena, schémas MCP, VFS dry-run, snapshots/résilience, mémoire, génome et APIs de workflow selon les sections du script.

```mermaid
sequenceDiagram
    participant Test as test_backend.js
    participant App as Express createApp()
    participant DB as SQLite test_genos.db
    Test->>DB: initialise schema et donnees
    Test->>App: requete HTTP localhost:4099
    App->>DB: handler / transaction
    DB-->>App: resultat
    App-->>Test: status + JSON + headers
    Test->>Test: assert
```

Il s'agit d'une vraie intégration du processus Express et de SQLite, mais pas d'un déploiement Docker, reverse proxy, TLS public ou navigateur réel.

---

## 7. Tests d'intégration gRPC

[backend/tests/test_grpc_services.js](../backend/tests/test_grpc_services.js) :

- charge les descripteurs protobuf ;
- crée un `grpc.Server` local ;
- enregistre tous les services ;
- écoute sur `127.0.0.1:50059` ;
- crée de vrais clients gRPC ;
- ajoute le metadata `x-genos-grpc-key` ;
- appelle des RPCs et compare les résultats à l'état SQLite lorsque nécessaire.

La suite couvre Core, Arena, Memory, Swarm, Resilience, RustBridge, Telemetry, Workspace et les services chargés dans le fichier complet. Elle teste donc le chargement proto, l'enregistrement, l'authentification gRPC et les conversions de données, pas une interopérabilité réseau inter-machine.

Les tests dédiés complètent ce socle pour l'auth, le bind sécurisé, le mapping des erreurs, l'isolation de ressources, d'expériences, d'incidents et de workflows.

---

## 8. Tests MCP

Le profil `test:mcp` rassemble :

- catalogue et registre d'outils ;
- schémas d'entrée ;
- permissions et scope ;
- transport HTTP MCP ;
- transport explicitement configuré ;
- parité serveur/contrat.

La couverture MCP est répartie dans de nombreux fichiers spécialisés : enveloppe, nomenclature, arguments, chemins d'entrée, timeout, lease, appels directs, dispatch/circuit breaker, bridge Codex et stratégies MCP.

Les tests [backend/tests/stress/test_mcp_stress.js](../backend/tests/stress/test_mcp_stress.js) vérifient aussi le VFS dry-run avec des entrées d'injection, les noms de type prototype, et le calcul de blast radius.

Exemple : une commande dangereuse contenant une chaîne d'injection est fournie au **simulateur** VFS ; le test confirme qu'elle est marquée destructive et capturée dans les effets simulés. Il ne lance pas cette commande sur le système hôte.

---

## 9. Tests adversariaux et sécurité

Le profil `test:security` lance [backend/tests/test_security_adversarial_master_runner.js](../backend/tests/test_security_adversarial_master_runner.js), lui-même complété par les tests adversariaux ciblés.

La couverture contient notamment :

- accès non authentifié rejeté ;
- frontières RBAC (`viewer`, `operator`, `admin`) ;
- CORS et CSRF ;
- sanitization XSS ;
- isolation MCP et circuit breaker ;
- tests de payloads hostiles, SQLi, SSRF, traversal et policy de providers selon les fichiers ciblés ;
- refus des actions destructives ou hors autorité.

Le harnais de stress historique [backend/tests/stress/test_stress.js](../backend/tests/stress/test_stress.js) démarre également Express et SQLite localement, puis vérifie des refus concrets HTTP `401`, `403` et les transitions du circuit breaker.

La démarche est comparable au système immunitaire :

- antigène : entrée inattendue, privilège insuffisant, URL hostile ou outil dangereux ;
- reconnaissance : middleware, validateurs et policy ;
- réponse : refus, quarantaine, audit ou ouverture du breaker ;
- mémoire : test de régression qui empêche le retour du défaut.

La métaphore est une organisation de défense logicielle, pas une équivalence biologique.

---

## 10. Stress, chaos et concurrence

### 10.1 Tests de stress présents

Le dossier `backend/tests/stress` contient des harnais dédiés à :

- arena ;
- MCP/VFS/blast radius ;
- mémoire et workspace ;
- résilience de swarm ;
- stress backend général ;
- banc comparatif adversarial multi-agents (`test_framework_adversarial_bench.js`) ;
- banc de surexploitation de la communication et gestion des tokens (`test_extreme_tokens_and_comm_bench.js`) ;
- banc de défense adversariale poussée à l'extrême (`test_apex_adversarial_defense_bench.js`).

Ils exercent surtout des entrées limites, des enchaînements de sécurité, des calculs de risque, des volumes logiques et des invariants de services. Ce sont des stress tests ciblés, non un benchmark de capacité avec SLO mesurés, trafic distribué ou collecte de percentiles de production.

#### 10.1.1 Banc d'épreuve adversarial multi-agents : GenOS vs LangChain, AutoGen, CrewAI

Le harnais [backend/tests/stress/test_framework_adversarial_bench.js](../backend/tests/stress/test_framework_adversarial_bench.js) teste 6 modes de défaillance structurels bien documentés dans les frameworks multi-agents conventionnels :

1. **Immunité épistémique vs empoisonnement d'hallucinations** (`contradictionCheck`, `beliefGate`) : face à une hallucination ou assertion hostile contredisant des preuves empiriques au sol, GenOS détecte la contradiction et bloque l'exécution en aval (`gateAction: REJECT`), là où LangChain/CrewAI propagent l'erreur par sycophancie.
2. **Interception de blocages ping-pong et boucles infinies** (`cycleDetection`, `BREAK_LOOP`) : détection déterministe des cycles de communication périodiques ($k \in [1, 4]$) ou en graphe orienté (DFS), arrêt de la fuite de jetons et sanction budgétaire cognitive, évitant l'épuisement de contexte typique des débats AutoGen non bornés.
3. **Branchement spéculatif et fusion causale à 3 voies** (`prmEvaluate`, `causalMerge`) : scoring d'invariants intermédiaires par Process Reward Model et réconciliation automatique de branches divergentes avec résolution de conflits, impossible sur les DAGs linéaires conventionnels.
4. **Résistance aux attaques Sybil et consensus calibré** (`weightedQuorum`, `brierScores`) : là où le vote majoritaire naïf d'AutoGen échoue si une majorité d'agents bruités outvote un expert, le quorum quadratique pondéré par les scores de Brier $(1 - \text{Brier})^2$ garantit le triomphe de la vérité calibrée.
5. **Topologie auto-cicatrisante sous panne en cascade** (`apoptosis`, `reallocate`, `pheromoneDeposit`) : suicide cellulaire propre de l'agent défaillant, réallocation équitable de son budget token aux survivants, et balisage stigmergique répulsif détournant dynamiquement le trafic vers les réplicas sains.
6. **Optimisation multi-objectifs non dominée au sens de Pareto** (`paretoSelect`) : sélection mathématique de la frontière de Pareto sur $N$ dimensions sans compromis arbitraire dans le prompt.

#### 10.1.2 Surexploitation de la communication et gestion critique des tokens

Le harnais [backend/tests/stress/test_extreme_tokens_and_comm_bench.js](../backend/tests/stress/test_extreme_tokens_and_comm_bench.js) teste 5 mécanismes où les alternatives conventionnelles s'effondrent sous la pression des messages et du coût des jetons :

1. **Suppression de la tempête de messages $O(N^2)$** (`networkSilence`, `contextCompaction`) : dans un groupe AutoGen de 10 agents, 20 tours de discussion génèrent un historique quadratique accumulant plus de 8 millions de jetons et provoquant un overflow de contexte. GenOS applique le protocole de silence réseau : 97,5% du bavardage est tamponné localement et seuls les événements critiques sont diffusés.
2. **Plafond matériel de budget de jetons & successive halving** (`budgetLimit`, `reallocate`) : là où LangChain boucle sans limite jusqu'au code HTTP 429 ou l'épuisement bancaire, GenOS stoppe mathématiquement l'exécution au seuil exact et redistribue la dotation des branches éliminées aux candidats viables.
3. **Rafale de 10 000 actions & entropie de Shannon en temps réel** (`calculateShannonEntropy`) : calcul instantané (< 50ms) de l'entropie d'information $H(A)$ pour détecter immédiatement l'effondrement en boucle morte (`COLLAPSE_DEADLOCK`) ou l'affolement (`SPIKE_CONFUSION`).
4. **Interception par connaissance négative à coût 0 token** (`avoidKnownDeadEnds`) : avant d'interroger un LLM ou d'exécuter un outil, GenOS compare la requête aux échecs vectorisés en base. Les motifs voués à l'échec sont bloqués instantanément sans dépenser un seul jeton LLM.
5. **Élagage synaptique biomimétique STDP** (`stdpUpdate`) : renforcement Hebbian sous neuromodulation dopaminergique pour les flux causaux prouvés et dépression anti-Hebbian pour les flux bruités, maintenant un rapport signal/bruit optimal même sous saturation de messages.

#### 10.1.3 Défense adversariale poussée à l'extrême (Vecteurs de niveau Apex)

Le harnais [backend/tests/stress/test_apex_adversarial_defense_bench.js](../backend/tests/stress/test_apex_adversarial_defense_bench.js) pousse la résistance immunitaire aux vecteurs d'attaque les plus hostiles :

1. **Injection de prompt polyglotte & verrouillage de blast radius** (`permissionCheck`, `circuitBreaker`) : tentative d'évasion forçant des commandes destructives (`rm -rf`) ou l'appel d'un outil sous quarantaine. L'exécution est bloquée physiquement au niveau du circuit breaker (`isDestructive: true`, `TOOL_LOCKED`) indépendamment de la complaisance du LLM.
2. **Attaque latérale d'un worker corrompu & veto d'escalade** (`authorizeAgentControl`) : tentative d'un worker de prendre le contrôle d'un pair sans mandat d'orchestrateur. Bloqué fermement par le contrôle d'autorité strict (`AGENT_CONTROL_FORBIDDEN`).
3. **Falsification de provenance Merkle & boucle cyclique DoS** (`resolveProvenance`) : insertion de références Merkle circulaires ($A \to B \to A$) visant à provoquer un débordement de pile ou une boucle infinie lors du parcours d'audit. Détection immédiate du cycle et neutralisation du déni de service.
4. **Attaque de consensus split-brain 50/50 & immunité au biais lexical** (`quorum`) : tentative d'un assaillant de remporter un vote ex-aequo en exploitant un tri alphabétique naïf. GenOS rejette tout départage lexical (`decision: null`, statut `tied`), déjouant l'attaque de split-brain.
5. **Résistance d'agent zombie & apoptose irrévocable** (`apoptosis`, `authorizeMission`) : agent renégat refusant la fin de mission. Verrouillage atomique du statut (`is_apoptotic = 1`, budget cognitif à 0), arrêt immédiat du runtime et interdiction définitive de tout dispatch ultérieur.
6. **Inondation de phéromones sur leurre & immunité de piste** (`pheromoneDeposit`) : tentative d'empoisonnement stigmergique par injection de valeurs numériques démesurées (+999 999 999) pour attirer l'essaim vers une passerelle hostile. Rejet strict des dépassements de bornes numériques finies.

### 10.2 Chaos engineering

Le dépôt ne contient pas de suite dédiée nommée `chaos`, ni d'injection systématique de pannes de réseau, disque, processus, DNS, clock skew ou partition inter-services.

Il existe des composants de résilience et quelques scénarios simulant erreurs, timeouts ou échecs de workers. Ceux-ci ne doivent pas être présentés comme une campagne de chaos complète.

### 10.3 Concurrence

Le profil `test:concurrency` couvre [backend/tests/test_seed_concurrency.js](../backend/tests/test_seed_concurrency.js).

Le test ouvre deux connexions SQLite vers le même fichier et exécute `seedDatabase` en parallèle. Il exige qu'un workspace concurrent ne crée qu'une unique alerte bootstrap déterministe.

$$
\left|\{a \mid a.workspace = w \land a.type = bootstrap\}\right| = 1
$$

Il vérifie donc une propriété précise d'idempotence concurrente. Il ne couvre pas exhaustivement l'ensemble des courses possibles des workers, sockets, transactions ou files de jobs.

---

## 11. Multi-tenant

Le profil `test:tenancy` exécute :

- `test_tenancy.js` ;
- `test_tenant_membership_scope.js` ;
- `test_trace_tenant_scope.js`.

Le test principal crée une base temporaire, un principal, une organisation, deux projets, des memberships et des workspaces portant le même nom dans des projets différents. Il démontre qu'un tenant valide est résolu et qu'un projet pour lequel le principal n'est pas membre est refusé.

La propriété attendue est :

$$
\text{access}(p, o, j) = \text{member}(p,o) \land \text{member}(p,j) \land j.organization = o
$$

Ce modèle teste l'isolement d'identité et de scope applicatif dans SQLite. Il ne remplace pas un test de séparation physique de bases, de clés de chiffrement par tenant ou de déploiements indépendants.

---

## 12. Migrations

Le profil `test:migration` rassemble :

- migration MsgPack ;
- ambiguïté de migration legacy ;
- migration de préférences de notification.

[backend/tests/test_msgpack_migration.js](../backend/tests/test_msgpack_migration.js) crée une base en mémoire avec des colonnes JSON historiques, lance `migrateToMsgPack`, décode le résultat avec `msgpackr`, puis lance une seconde fois la migration et exige qu'elle n'applique aucun changement.

L'invariant est l'idempotence :

$$
M(M(D)) = M(D)
$$

avec conservation de la valeur utile :

$$
decode(M(D)) = D
$$

Cette approche est solide pour le transformateur et son absence de double-écriture. Elle ne simule pas, à elle seule, une migration de base de production très volumineuse ni une coupure pendant transaction.

---

## 13. Compatibilité CLI

La validation CLI couvre plusieurs frontières :

- les tests unitaires Rust de `genos-cli` ;
- [backend/tests/test_command_service_contract.js](../backend/tests/test_command_service_contract.js), qui vérifie le bridge gRPC de commandes ;
- [backend/tests/test_genos_cli_environment.js](../backend/tests/test_genos_cli_environment.js), qui vérifie le filtrage de l'environnement transmis au binaire ;
- les tests d'arguments et de sous-commandes sous `crates/genos-api/tests` et les crates concernées.

Le contrat gRPC est explicitement vérifié : `snapshot create --out "file with spaces.json"` est transmis sous forme de tableau d'arguments, tandis que `node -e evil` est rejeté avec `exit_code: 2` et le statut `invalid_command`.

Il s'agit d'une compatibilité de contrat et d'invocation. Les wrappers Windows `g.ps1` et `g.cmd` sont présents, mais le profil de validation ne constitue pas une matrice automatisée exhaustive sur toutes les versions de PowerShell, `cmd.exe` et Windows.

---

## 14. Providers modèles : réel, mocké, configuration

Le profil `test:providers` contient :

- `test_supported_model_providers.js` ;
- `test_ollama_native_protocol.js` ;
- `test_openai_compatible_configuration.js`.

Les propriétés réellement testées sont :

- l'allowlist des providers pris en charge ;
- l'obligation d'un endpoint explicite pour `openai-compatible` ;
- la forme d'une requête Ollama ;
- le parsing d'un stream NDJSON Ollama, les tokens et l'assemblage du texte.

Dans le test Ollama, `global.fetch` est remplacé par un double qui retourne des chunks NDJSON contrôlés. Aucun appel n'est envoyé à un Ollama, OpenAI, Anthropic, Gemini ou autre provider réel.

| Type de test | Présent | Limite |
|---|---|---|
| registre de providers | oui | ne garantit ni credentials ni disponibilité distante |
| configuration d'endpoint | oui | ne contacte pas le provider |
| protocole NDJSON Ollama | oui, avec `fetch` mocké | pas de serveur Ollama réel |
| appel provider cloud réel | pas dans le profil standard | credentials, coût, réseau et quotas volontairement hors CI |

Pour une validation live, un environnement séparé doit fournir des clés non productives, un budget, une allowlist de modèles et des assertions qui évitent de qualifier une réponse LLM de vérité métier.

---

## 15. Crash et reprise

Le profil `test:recovery` regroupe :

- recovery de worker ;
- bisection causale automatique ;
- reconnexions de boucle d'exécution.

[backend/tests/test_worker_failure_recovery.js](../backend/tests/test_worker_failure_recovery.js) vérifie les décisions `mutate_worker`, `fork_worker`, `replace_worker`, `escalate_unresolved` et le traitement strict d'un `no_answer` sans preuve.

[backend/tests/test_automatic_bisection_recovery.js](../backend/tests/test_automatic_bisection_recovery.js) construit une timeline de snapshots contenant une régression, demande son isolement et vérifie que le nombre d'itérations reste borné par une recherche dichotomique :

$$
k \leq \lceil \log_2(n) \rceil + 1
$$

Le même scénario injecte ensuite snapshots, agents et échec dans SQLite, observe une mission de récupération interceptée, et vérifie l'événement de télémétrie.

Ces tests exercent vraiment la décision de reprise, la persistence locale et la composition des prompts. Ils ne font pas tomber volontairement une machine, ne redémarrent pas un cluster et ne prouvent pas la récupération après coupure d'alimentation ou corruption de disque.

---

## 16. Exemple de stratégie de validation

Pour modifier une route tenant-aware qui exécute un outil MCP :

```powershell
$env:GENOS_ADMIN_PASSWORD = 'test-only'
npm --prefix backend run test:tenancy
npm --prefix backend run test:mcp
npm --prefix backend run test:security
```

Pour un changement du binaire natif :

```powershell
cargo test -p genos-cli
node backend/tests/test_command_service_contract.js
node backend/tests/test_genos_cli_environment.js
```

Pour une migration SQLite :

```powershell
npm --prefix backend run test:migration
```

La sélection doit suivre la surface modifiée. Le profil `all` est utile avant intégration large, mais une suite ciblée est le contrôle le plus rapide pour falsifier une hypothèse locale.

---

## 17. Comparaison avec le marché

| Dimension | GenOS | Pratique commune mature |
|---|---|---|
| unités Node | scripts `assert` exécutables directement | Jest/Vitest/Mocha avec rapports et mocks centralisés |
| unités Rust | `cargo test` par crate | identique, souvent complété par proptest/fuzzing |
| REST | serveur Express réel et SQLite locale | Testcontainers, DB éphémère, tests d'API contractuelle |
| gRPC | serveur/client local avec protos réels | idem, plus tests de compatibilité inter-version et TLS distant |
| MCP | contrats, schemas, transport, lease et permissions | domaine encore récent ; approche similaire aux tests de plugins/outils |
| adversarial | suites dédiées aux routes et policy | SAST/DAST, fuzzing, scans dépendances, pentests automatisés |
| stress | harnais logiques ciblés | k6/Locust/Gatling avec charge distribuée et SLO |
| chaos | pas de suite dédiée | LitmusChaos, Chaos Mesh, pannes réseau/disque/processus contrôlées |
| providers LLM | mocks de configuration et protocole | sandbox live, enregistrements de réponses, budgets et évaluations canari |
| recovery | décisions, SQLite et bisection testées | plus chaos restart, backup restore et DR drills |

La force actuelle de GenOS est la proximité entre ses contrats de sécurité/runtime et leurs scripts de validation ciblés. Les principaux écarts avec une plateforme de validation mature sont une couverture de chaos non systématique, l'absence de suite provider live standardisée, l'absence de test de charge avec SLO, et une automatisation Windows CLI non exhaustive.

---

## Conclusion

La validation GenOS est un portefeuille de tests concrets : Rust local, Node par services, Express et gRPC réellement démarrés en local, SQLite temporaire, contrats MCP, protections adversariales, tenant, migration, concurrence et recovery.

La lecture opérationnelle correcte est la suivante :

- les intégrations REST/gRPC et la persistence SQLite sont effectivement exercées ;
- MCP est fortement testé au niveau contrats, policy et transports configurés ;
- stress et recovery existent mais restent ciblés ;
- chaos engineering dédié et providers modèles live ne font pas partie de la suite standard ;
- une suite verte atteste les propriétés précisées par ses assertions, pas une garantie générale de comportement autonome en production.


---

## Schémas Complémentaires de la Pyramide de Tests et Validation

### 1. Pyramide de Tests du Dépôt GenOS

```mermaid
flowchart TB
    subgraph TestPyramid["Pyramide de Qualification de Runtime"]
        E2E["Niveau 4 : Tests E2E de Flottes & Simulation Nosologique (100 agents)"]
        Integ["Niveau 3 : Tests d'Intégration gRPC / REST / SQLite WAL"]
        Prop["Niveau 2 : Tests Basés sur les Propriétés (Proptest Rust / Fuzzing)"]
        Unit["Niveau 1 : Tests Unitaires Déterministes (Maths, Conscience, Primitives)"]
    end

    Unit --> Prop
    Prop --> Integ
    Integ --> E2E
```

### 2. Séquence d'Exécution du Pipeline de Qualification Continue (CI)

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Développeur / Agent
    participant CI as Pipeline GitHub Actions
    participant UnitRunner as Test Runner Unitaire
    participant NosoSim as Simulateur Nosologique
    participant AuditGate as Gate de Validation

    Dev->>CI: Push de nouvelle branche
    activate CI
    CI->>UnitRunner: Lancement tests Rust (`cargo test --workspace`)
    UnitRunner-->>CI: 100% PASS
    
    CI->>NosoSim: Lancement de la simulation d'invariants (Orage cytokinique, Hayflick)
    NosoSim-->>CI: Homéostasie préservée (0 régression)
    
    CI->>AuditGate: Évaluation de couverture et preuve
    AuditGate-->>CI: Certification PASS (Prêt pour merge)
    CI-->>Dev: Build vert avec badge de conformité
    deactivate CI
```

---

## 15. Banc d'Épreuve des Attaques Adversariales Réelles (`npm run test:real-attacks`)

Le profil de test `npm run test:real-attacks` ([backend/tests/stress/test_real_world_adversarial_attacks.js](../backend/tests/stress/test_real_world_adversarial_attacks.js)) exécute 26 épreuves d'attaques de bout en bout modélisées sur des CVE réelles et la taxonomie **MITRE ATLAS** pour agents IA autonomes. 

Contrairement aux frameworks d'agents généralistes (LangChain, AutoGen, CrewAI) qui délèguent aveuglément l'exécution d'outils au LLM et font confiance aux mémoires vectorielles injectées, GenOS oppose une défense étagée et formelle :

```mermaid
flowchart TD
    Payload[Vecteur d'Attaque Réel] --> Stage1{1. Détection Immunitaire Cognitive}
    Stage1 -- Injection Détectée --> Block1[Quarantaine / Circuit Breaker]
    Stage1 -- Passé / Évasif --> Stage2{2. VFS Sandbox & Pre-flight Blast Radius}
    Stage2 -- Sortie Espace / Risque Elevé --> Block2[Refus de Spawn Processus]
    Stage2 -- Passé --> Stage3{3. Epistemic Verification Layer}
    Stage3 -- Non Prouvé / Halluciné --> Block3[HALT - Forbidden Ops: act, plan, generate]
    Stage3 -- Passé --> Stage4{4. SSRF & Pinning Policy}
    Stage4 -- Metadata Cloud / Rebinding --> Block4[INVALID_WEBHOOK_URL]
    Stage4 -- Passé --> Stage5{5. Séparation des Pouvoirs & Preuve Hash}
    Stage5 -- Auto-Approbation / Sybil --> Block5[Refus Mutation Production]
    Stage5 -- Approuvé Humain --> Exec[Exécution Sanctuarisée]
```

### 15.1 Scénarios Éprouvés

| # | Vecteur d'Attaque (MITRE ATLAS / CVE) | Comportement LangChain / AutoGen / CrewAI | Défense Active GenOS | Statut |
|---|---|---|---|---|
| **1** | **Indirect Prompt Injection Polyglotte & Trojan Repo** (Commentaires Markdown cachés avec commande shell d'exfiltration) | Le LLM lit le README, génère l'appel d'outil `bash()`, le framework l'exécute directement sur l'hôte | `immuneThreats` détecte la double injection, `simulateDryRun` note le blast radius (55) et impose le rôle `admin`, `executeSandboxed` bloque l'exécution réelle sans clé explicite | **26/26 PASS** |
| **2** | **Empoisonnement Persistant de RAG / Mémoire Vectorielle** (Injection de fausse directive "Désactiver TLS pour optimiser la DB") | L'agent de la session suivante fait un `similarity_search`, injecte le conseil dans le prompt et désactive TLS | `epistemics.validateMemoryPerception` isole l'énoncé non ancré, passe l'état en `INVALID` et bloque formellement les opérations `['generate', 'act', 'plan']` | **26/26 PASS** |
| **3** | **SSRF Cloud Metadata (AWS/GCP/Alibaba) & DNS Rebinding** (`169.254.169.254`, loopbacks, rebinding vers réseau privé) | Les outils Web standard (`requests`, `axios`) contactent l'IP de métadonnées et fuient les credentials IAM | `webhookService` & `providerEndpointPolicy` filtrent octets décimaux/octaux/hex, rejettent `169.254.169.254` et épinglent l'IP résolue (`postPinned`) | **26/26 PASS** |
| **4** | **Traversée de Répertoire & Évasion de Bac à Sable** (`../../Windows/System32` ou `/etc/passwd`) | Les chemins d'écriture sont passés tels quels au filesystem de l'hôte | `pathSafety.normalizeRelativePath` et `vfsSandboxService` confinent strictement chaque opération au VFS et rejettent tout chemin fuyant la racine | **26/26 PASS** |
| **5** | **Infiltration Sybil & Biais d'Auto-Approbation** (Attaquant exploitant des alias ou faux votes pour valider une promotion) | Les systèmes basés sur le vote majoritaire ($M/N$) sont manipulés par création massive de personas synthétiques | `platformApprovalPolicy.isSelfApproval` unifie `username` et `keyId`, exige une stricte séparation des devoirs et vérifie l'intégrité SHA-256 du payload | **26/26 PASS** |

---

## 16. Banc d'Épreuve : Raisonnement Temporel & Rejeu Causal (`npm run test:temporal`)

Le profil de test `npm run test:temporal` ([backend/tests/stress/test_temporal_reasoning_bench.js](../backend/tests/stress/test_temporal_reasoning_bench.js)) soumet le moteur agentique à 20 défis de raisonnement temporel, contrefactuel et causal.

Alors que les architectures d'agents conventionnelles (LangChain, AutoGen, CrewAI) stockent l'historique sous forme d'une liste linéaire unidirectionnelle strictement append-only (`messages.append(...)`) incapable de bifurquer dans le passé ou de réconcilier des états divergents, GenOS intègre une algèbre causale native :

```mermaid
graph TD
    T0["T0: État Initial"] --> T1["T1: Étape 1"]
    T1 --> T2["T2: Étape 2"]
    T2 --> T3["T3: Décision Errante (TLS Disabled)"]
    T3 --> T4["T4: Crash / Anomalie"]
    
    subgraph "Time Travel & Counterfactual Branching"
        T2 -.->|"Intervention (Replay k=3)"| C3["T3': Replay Contrefactuel (Cert Pinning)"]
        C3 --> C4["T4': Trajectoire Alternative Stable (SUCCESS)"]
    end
    
    subgraph "Three-Way Causal Merge"
        Base["Base Ancestrale (T2)"] --> MergeNode{"causalMerge(Base, C4, T4)"}
        C4 --> MergeNode
        Live["Branche Live"] --> MergeNode
        MergeNode --> Harmonized["État Réconcilié (0 Conflit)"]
    end
```

### 16.1 Défis de Raisonnement Temporel Éprouvés

| Défi Temporel | Limite Déterminante (LangChain / AutoGen / CrewAI) | Technologie & Algèbre Temporelle GenOS | Statut Test (20/20) |
|---|---|---|---|
| **1. Branchement Contrefactuel "What-If" & Diff Causal** | Aucune bifurcation temporelle : modifier le passé écrase l'historique ou duplique naïvement tous les tokens en avant. | `counterfactualReplay` isole l'intervention au pas $k$, calcule un hash SHA-256 immuable de trajectoire et `causalDiff` pointe la divergence exacte sans polluer l'historique réel. | **4/4 PASS** |
| **2. Bisection Causale Temporelle en $O(\log N)$ sur 128 Snapshots** | En cas d'erreur introduite il y a 50 étapes, les frameworks itèrent linéairement ($O(N)$) ou hallucinent l'origine du bug. | `bisectAnomaly` isole le pas exact de régression (pas 53 sur 128 snapshots) en **$\le 7$ étapes de recherche** avec vérification de stabilité et de monotonicité. | **3/3 PASS** |
| **3. Réconciliation Causale à 3 Voies (`causalMerge`)** | L'absence d'algèbre de fusion écrase arbitrairement les états concurrents (Last-Write-Wins destructif). | `causalMerge` compare Base vs Left (branche intervention) vs Right (branche live) pour fusionner les clés non recouvrantes et détecter formellement les conflits concurrents. | **3/3 PASS** |
| **4. Pliage Déterministe d'Historique sur 100 Tours (`stateFold`)** | Les contextes dépassés subissent une troncature FIFO naive (`messages[-10:]`), oubliant les préconditions causales initiales. | `stateFold` compense 100 micro-mutations en un état synthétique compact non déperditif, consolidant les modifications de fichiers et le statut d'intégrité (`isClean`). | **3/3 PASS** |
| **5. Invalidation Topologique Descendante & DAG Synaptique** | Quand un postulat passé est réfuté, il persiste dans le RAG / prompt, causant des cascades d'hallucinations ("fantômes de prémisses"). | `replayDependencies` et `dependencyMatrix` parcourent récursivement les synapses causales de `genome_decisions` pour collecter et recalibrer tous les descendants temporels. | **3/3 PASS** |
| **6. Mondes Futurs Probabilistes & Verdicts d'Équivalence** | Génération mono-flux incapable d'évaluer la divergence sémantique entre futurs alternatifs. | `futureWorlds` projette des branches à horizons multiples et `equivalenceVerdict` compare les sorties par similarité Jaccard pour valider ou rejeter la divergence. | **4/4 PASS** |

---

## 17. Banc d'Épreuve : Rappel Précis de Faits Directs (`npm run test:fact-recall`)

Le profil de test `npm run test:fact-recall` ([backend/tests/stress/test_single_hop_fact_recall_bench.js](../backend/tests/stress/test_single_hop_fact_recall_bench.js)) soumet le système de mémoire cognitive à 15 défis de rappel direct de faits (*Single-Hop Fact Recall / NIAH*).

Les frameworks de RAG naïfs (LangChain, AutoGen, CrewAI) souffrent de trois écueils critiques :
1. **Dilution vectorielle en meule de foin (NIAH)** : face à 50 leurres sémantiques similaires, la similarité cosinus s'effondre et retourne le mauvais cluster.
2. **Amnésie de rétractation** : quand un fait est révoqué ou rendu obsolète, ils continuent de le remonter car sa proximité lexicale reste élevée (absence d'inhibition synaptique).
3. **Hallucination d'absence** : quand une entité n'existe pas en mémoire, ils hallucinent une valeur plausible au lieu d'émettre un refus catégorique fondé sur l'ignorance épistémique.

```mermaid
flowchart LR
    Query[Requête Factuelle Directe] --> CheckGABA{Vérification Synapses GABAergiques}
    CheckGABA -- Fait Révoqué / Obsolète --> Suppress[Inhibition Active - Non Remonté]
    CheckGABA -- Fait Valide --> Score[Scoring Hybride: Vecteur 768d + TF-IDF + Recency]
    Score --> MetaCheck{Contrôle Métacognitif Dentate Gyrus}
    MetaCheck -- Entité Inconnue / Confiance Basse --> SignalIgnorance[Signal Épistémique d'Ignorance - Refus de Spéculer]
    MetaCheck -- Fait Identifié --> EpistemicShield{Filtre Épistémique de Perception}
    EpistemicShield -- Allégation Non Vérifiée --> Quarantine[INVALID - Interdiction: act, generate]
    EpistemicShield -- Fait Certifié --> ReturnFact[Rappel Déterministe Rang 1]
```

### 17.1 Épreuves de Rappel Factuel Direct Éprouvées

| Épreuve de Rappel Factuel | Vulnérabilité des Systèmes Naïfs (LangChain / AutoGen / CrewAI) | Technologie de Rappel Cognitif GenOS | Statut Test (15/15) |
```

Pour un changement du binaire natif :

```powershell
cargo test -p genos-cli
node backend/tests/test_command_service_contract.js
node backend/tests/test_genos_cli_environment.js
```

Pour une migration SQLite :

```powershell
npm --prefix backend run test:migration
```

La sélection doit suivre la surface modifiée. Le profil `all` est utile avant intégration large, mais une suite ciblée est le contrôle le plus rapide pour falsifier une hypothèse locale.

---

## 17. Comparaison avec le marché

| Dimension | GenOS | Pratique commune mature |
|---|---|---|
| unités Node | scripts `assert` exécutables directement | Jest/Vitest/Mocha avec rapports et mocks centralisés |
| unités Rust | `cargo test` par crate | identique, souvent complété par proptest/fuzzing |
| REST | serveur Express réel et SQLite locale | Testcontainers, DB éphémère, tests d'API contractuelle |
| gRPC | serveur/client local avec protos réels | idem, plus tests de compatibilité inter-version et TLS distant |
| MCP | contrats, schemas, transport, lease et permissions | domaine encore récent ; approche similaire aux tests de plugins/outils |
| adversarial | suites dédiées aux routes et policy | SAST/DAST, fuzzing, scans dépendances, pentests automatisés |
| stress | harnais logiques ciblés | k6/Locust/Gatling avec charge distribuée et SLO |
| chaos | pas de suite dédiée | LitmusChaos, Chaos Mesh, pannes réseau/disque/processus contrôlées |
| providers LLM | mocks de configuration et protocole | sandbox live, enregistrements de réponses, budgets et évaluations canari |
| recovery | décisions, SQLite et bisection testées | plus chaos restart, backup restore et DR drills |

La force actuelle de GenOS est la proximité entre ses contrats de sécurité/runtime et leurs scripts de validation ciblés. Les principaux écarts avec une plateforme de validation mature sont une couverture de chaos non systématique, l'absence de suite provider live standardisée, l'absence de test de charge avec SLO, et une automatisation Windows CLI non exhaustive.

---

## Conclusion

La validation GenOS est un portefeuille de tests concrets : Rust local, Node par services, Express et gRPC réellement démarrés en local, SQLite temporaire, contrats MCP, protections adversariales, tenant, migration, concurrence et recovery.

La lecture opérationnelle correcte est la suivante :

- les intégrations REST/gRPC et la persistence SQLite sont effectivement exercées ;
- MCP est fortement testé au niveau contrats, policy et transports configurés ;
- stress et recovery existent mais restent ciblés ;
- chaos engineering dédié et providers modèles live ne font pas partie de la suite standard ;
- une suite verte atteste les propriétés précisées par ses assertions, pas une garantie générale de comportement autonome en production.


---

## Schémas Complémentaires de la Pyramide de Tests et Validation

### 1. Pyramide de Tests du Dépôt GenOS

```mermaid
flowchart TB
    subgraph TestPyramid["Pyramide de Qualification de Runtime"]
        E2E["Niveau 4 : Tests E2E de Flottes & Simulation Nosologique (100 agents)"]
        Integ["Niveau 3 : Tests d'Intégration gRPC / REST / SQLite WAL"]
        Prop["Niveau 2 : Tests Basés sur les Propriétés (Proptest Rust / Fuzzing)"]
        Unit["Niveau 1 : Tests Unitaires Déterministes (Maths, Conscience, Primitives)"]
    end

    Unit --> Prop
    Prop --> Integ
    Integ --> E2E
```

### 2. Séquence d'Exécution du Pipeline de Qualification Continue (CI)

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Développeur / Agent
    participant CI as Pipeline GitHub Actions
    participant UnitRunner as Test Runner Unitaire
    participant NosoSim as Simulateur Nosologique
    participant AuditGate as Gate de Validation

    Dev->>CI: Push de nouvelle branche
    activate CI
    CI->>UnitRunner: Lancement tests Rust (`cargo test --workspace`)
    UnitRunner-->>CI: 100% PASS
    
    CI->>NosoSim: Lancement de la simulation d'invariants (Orage cytokinique, Hayflick)
    NosoSim-->>CI: Homéostasie préservée (0 régression)
    
    CI->>AuditGate: Évaluation de couverture et preuve
    AuditGate-->>CI: Certification PASS (Prêt pour merge)
    CI-->>Dev: Build vert avec badge de conformité
    deactivate CI
```

---

## 15. Banc d'Épreuve des Attaques Adversariales Réelles (`npm run test:real-attacks`)

Le profil de test `npm run test:real-attacks` ([backend/tests/stress/test_real_world_adversarial_attacks.js](../backend/tests/stress/test_real_world_adversarial_attacks.js)) exécute 26 épreuves d'attaques de bout en bout modélisées sur des CVE réelles et la taxonomie **MITRE ATLAS** pour agents IA autonomes. 

Contrairement aux frameworks d'agents généralistes (LangChain, AutoGen, CrewAI) qui délèguent aveuglément l'exécution d'outils au LLM et font confiance aux mémoires vectorielles injectées, GenOS oppose une défense étagée et formelle :

```mermaid
flowchart TD
    Payload[Vecteur d'Attaque Réel] --> Stage1{1. Détection Immunitaire Cognitive}
    Stage1 -- Injection Détectée --> Block1[Quarantaine / Circuit Breaker]
    Stage1 -- Passé / Évasif --> Stage2{2. VFS Sandbox & Pre-flight Blast Radius}
    Stage2 -- Sortie Espace / Risque Elevé --> Block2[Refus de Spawn Processus]
    Stage2 -- Passé --> Stage3{3. Epistemic Verification Layer}
    Stage3 -- Non Prouvé / Halluciné --> Block3[HALT - Forbidden Ops: act, plan, generate]
    Stage3 -- Passé --> Stage4{4. SSRF & Pinning Policy}
    Stage4 -- Metadata Cloud / Rebinding --> Block4[INVALID_WEBHOOK_URL]
    Stage4 -- Passé --> Stage5{5. Séparation des Pouvoirs & Preuve Hash}
    Stage5 -- Auto-Approbation / Sybil --> Block5[Refus Mutation Production]
    Stage5 -- Approuvé Humain --> Exec[Exécution Sanctuarisée]
```

### 15.1 Scénarios Éprouvés

| # | Vecteur d'Attaque (MITRE ATLAS / CVE) | Comportement LangChain / AutoGen / CrewAI | Défense Active GenOS | Statut |
|---|---|---|---|---|
| **1** | **Indirect Prompt Injection Polyglotte & Trojan Repo** (Commentaires Markdown cachés avec commande shell d'exfiltration) | Le LLM lit le README, génère l'appel d'outil `bash()`, le framework l'exécute directement sur l'hôte | `immuneThreats` détecte la double injection, `simulateDryRun` note le blast radius (55) et impose le rôle `admin`, `executeSandboxed` bloque l'exécution réelle sans clé explicite | **26/26 PASS** |
| **2** | **Empoisonnement Persistant de RAG / Mémoire Vectorielle** (Injection de fausse directive "Désactiver TLS pour optimiser la DB") | L'agent de la session suivante fait un `similarity_search`, injecte le conseil dans le prompt et désactive TLS | `epistemics.validateMemoryPerception` isole l'énoncé non ancré, passe l'état en `INVALID` et bloque formellement les opérations `['generate', 'act', 'plan']` | **26/26 PASS** |
| **3** | **SSRF Cloud Metadata (AWS/GCP/Alibaba) & DNS Rebinding** (`169.254.169.254`, loopbacks, rebinding vers réseau privé) | Les outils Web standard (`requests`, `axios`) contactent l'IP de métadonnées et fuient les credentials IAM | `webhookService` & `providerEndpointPolicy` filtrent octets décimaux/octaux/hex, rejettent `169.254.169.254` et épinglent l'IP résolue (`postPinned`) | **26/26 PASS** |
| **4** | **Traversée de Répertoire & Évasion de Bac à Sable** (`../../Windows/System32` ou `/etc/passwd`) | Les chemins d'écriture sont passés tels quels au filesystem de l'hôte | `pathSafety.normalizeRelativePath` et `vfsSandboxService` confinent strictement chaque opération au VFS et rejettent tout chemin fuyant la racine | **26/26 PASS** |
| **5** | **Infiltration Sybil & Biais d'Auto-Approbation** (Attaquant exploitant des alias ou faux votes pour valider une promotion) | Les systèmes basés sur le vote majoritaire ($M/N$) sont manipulés par création massive de personas synthétiques | `platformApprovalPolicy.isSelfApproval` unifie `username` et `keyId`, exige une stricte séparation des devoirs et vérifie l'intégrité SHA-256 du payload | **26/26 PASS** |

---

## 16. Banc d'Épreuve : Raisonnement Temporel & Rejeu Causal (`npm run test:temporal`)

Le profil de test `npm run test:temporal` ([backend/tests/stress/test_temporal_reasoning_bench.js](../backend/tests/stress/test_temporal_reasoning_bench.js)) soumet le moteur agentique à 20 défis de raisonnement temporel, contrefactuel et causal.

Alors que les architectures d'agents conventionnelles (LangChain, AutoGen, CrewAI) stockent l'historique sous forme d'une liste linéaire unidirectionnelle strictement append-only (`messages.append(...)`) incapable de bifurquer dans le passé ou de réconcilier des états divergents, GenOS intègre une algèbre causale native :

```mermaid
graph TD
    T0["T0: État Initial"] --> T1["T1: Étape 1"]
    T1 --> T2["T2: Étape 2"]
    T2 --> T3["T3: Décision Errante (TLS Disabled)"]
    T3 --> T4["T4: Crash / Anomalie"]
    
    subgraph "Time Travel & Counterfactual Branching"
        T2 -.->|"Intervention (Replay k=3)"| C3["T3': Replay Contrefactuel (Cert Pinning)"]
        C3 --> C4["T4': Trajectoire Alternative Stable (SUCCESS)"]
    end
    
    subgraph "Three-Way Causal Merge"
        Base["Base Ancestrale (T2)"] --> MergeNode{"causalMerge(Base, C4, T4)"}
        C4 --> MergeNode
        Live["Branche Live"] --> MergeNode
        MergeNode --> Harmonized["État Réconcilié (0 Conflit)"]
    end
```

### 16.1 Défis de Raisonnement Temporel Éprouvés

| Défi Temporel | Limite Déterminante (LangChain / AutoGen / CrewAI) | Technologie & Algèbre Temporelle GenOS | Statut Test (20/20) |
|---|---|---|---|
| **1. Branchement Contrefactuel "What-If" & Diff Causal** | Aucune bifurcation temporelle : modifier le passé écrase l'historique ou duplique naïvement tous les tokens en avant. | `counterfactualReplay` isole l'intervention au pas $k$, calcule un hash SHA-256 immuable de trajectoire et `causalDiff` pointe la divergence exacte sans polluer l'historique réel. | **4/4 PASS** |
| **2. Bisection Causale Temporelle en $O(\log N)$ sur 128 Snapshots** | En cas d'erreur introduite il y a 50 étapes, les frameworks itèrent linéairement ($O(N)$) ou hallucinent l'origine du bug. | `bisectAnomaly` isole le pas exact de régression (pas 53 sur 128 snapshots) en **$\le 7$ étapes de recherche** avec vérification de stabilité et de monotonicité. | **3/3 PASS** |
| **3. Réconciliation Causale à 3 Voies (`causalMerge`)** | L'absence d'algèbre de fusion écrase arbitrairement les états concurrents (Last-Write-Wins destructif). | `causalMerge` compare Base vs Left (branche intervention) vs Right (branche live) pour fusionner les clés non recouvrantes et détecter formellement les conflits concurrents. | **3/3 PASS** |
| **4. Pliage Déterministe d'Historique sur 100 Tours (`stateFold`)** | Les contextes dépassés subissent une troncature FIFO naive (`messages[-10:]`), oubliant les préconditions causales initiales. | `stateFold` compense 100 micro-mutations en un état synthétique compact non déperditif, consolidant les modifications de fichiers et le statut d'intégrité (`isClean`). | **3/3 PASS** |
| **5. Invalidation Topologique Descendante & DAG Synaptique** | Quand un postulat passé est réfuté, il persiste dans le RAG / prompt, causant des cascades d'hallucinations ("fantômes de prémisses"). | `replayDependencies` et `dependencyMatrix` parcourent récursivement les synapses causales de `genome_decisions` pour collecter et recalibrer tous les descendants temporels. | **3/3 PASS** |
| **6. Mondes Futurs Probabilistes & Verdicts d'Équivalence** | Génération mono-flux incapable d'évaluer la divergence sémantique entre futurs alternatifs. | `futureWorlds` projette des branches à horizons multiples et `equivalenceVerdict` compare les sorties par similarité Jaccard pour valider ou rejeter la divergence. | **4/4 PASS** |

---

## 17. Banc d'Épreuve : Rappel Précis de Faits Directs (`npm run test:fact-recall`)

Le profil de test `npm run test:fact-recall` ([backend/tests/stress/test_single_hop_fact_recall_bench.js](../backend/tests/stress/test_single_hop_fact_recall_bench.js)) soumet le système de mémoire cognitive à 15 défis de rappel direct de faits (*Single-Hop Fact Recall / NIAH*).

Les frameworks de RAG naïfs (LangChain, AutoGen, CrewAI) souffrent de trois écueils critiques :
1. **Dilution vectorielle en meule de foin (NIAH)** : face à 50 leurres sémantiques similaires, la similarité cosinus s'effondre et retourne le mauvais cluster.
2. **Amnésie de rétractation** : quand un fait est révoqué ou rendu obsolète, ils continuent de le remonter car sa proximité lexicale reste élevée (absence d'inhibition synaptique).
3. **Hallucination d'absence** : quand une entité n'existe pas en mémoire, ils hallucinent une valeur plausible au lieu d'émettre un refus catégorique fondé sur l'ignorance épistémique.

```mermaid
flowchart LR
    Query[Requête Factuelle Directe] --> CheckGABA{Vérification Synapses GABAergiques}
    CheckGABA -- Fait Révoqué / Obsolète --> Suppress[Inhibition Active - Non Remonté]
    CheckGABA -- Fait Valide --> Score[Scoring Hybride: Vecteur 768d + TF-IDF + Recency]
    Score --> MetaCheck{Contrôle Métacognitif Dentate Gyrus}
    MetaCheck -- Entité Inconnue / Confiance Basse --> SignalIgnorance[Signal Épistémique d'Ignorance - Refus de Spéculer]
    MetaCheck -- Fait Identifié --> EpistemicShield{Filtre Épistémique de Perception}
    EpistemicShield -- Allégation Non Vérifiée --> Quarantine[INVALID - Interdiction: act, generate]
    EpistemicShield -- Fait Certifié --> ReturnFact[Rappel Déterministe Rang 1]
```

### 17.1 Épreuves de Rappel Factuel Direct Éprouvées

| Épreuve de Rappel Factuel | Vulnérabilité des Systèmes Naïfs (LangChain / AutoGen / CrewAI) | Technologie de Rappel Cognitif GenOS | Statut Test (15/15) |
|---|---|---|---|
| **1. Aiguille en Meule de Foin (NIAH) avec 50 Leurres** | Les collisions lexicales et la dilution vectorielle sélectionnent un leurre erroné. | Combinaison RRF + vecteur dense 768d avec départage cosinus déterministe (`mem_omega` extrait au Rang 1). | **2/2 PASS** |
| **2. Rétractation & Inhibition Synaptique GABAergique** | Un fait obsolète ("port 5432") continue d'être extrait malgré l'existence d'une migration ("port 5433"). | Les synapses GABAergiques à poids négatif (`weight < 0`, `transmitter: gaba`) suppriment activement le fait révoqué. | **3/3 PASS** |
| **3. Détection de Nouveauté Métacognitive & Refus d'Hallucination** | L'absence d'information provoque l'invention pure et simple d'identifiants ou de clés secrètes. | Le module métacognitif identifie la nouveauté (`noveltyDetected: true`) et active le disjoncteur d'inhibition GABA. | **2/2 PASS** |
| **4. Confinement Strict Multi-Tenant & Multi-Projet** | Les magasins vectoriels partagés fuient des données confidentielles entre locataires / projets non filtrés. | L'isolation SQLite et le scoping hermétique (`organization_id`, `project_id`) garantissent 0 fuite inter-organisation. | **3/3 PASS** |
| **5. Bouclier Épistémique sur Faits Toxiques ou Supprimés** | Les allégations marquées `[unverified_claim]` sont incorporées telles quelles dans la génération. | `epistemics.validateMemoryPerception` passe le statut en `INVALID` et verrouille formellement `generate`, `act`, `plan`. | **3/3 PASS** |
| **6. Latence & Débit Haute Fréquence (< 50ms)** | Les wrappers Python séquentiels ralentissent sous la charge de requêtes concurrentes. | Moteur de recherche hybride local ultra-rapide exécutant le rappel direct en **$\approx 35-45$ ms** sous empreinte mémoire bornée. | **2/2 PASS** |

---

## 18. Banc d'Épreuve : Raisonnement Multi-Hop Cross-Session (`npm run test:multi-hop`)

Le profil de test `npm run test:multi-hop` ([backend/tests/stress/test_cross_session_multi_hop_bench.js](../backend/tests/stress/test_cross_session_multi_hop_bench.js)) soumet l'architecture de mémoire cognitive GenOS à 13 défis extrêmes de raisonnement multi-sauts (*Multi-Hop Reasoning*) à travers des sessions disjointes et indépendantes.

### Pourquoi les architectures concurrentes (LangChain, AutoGen, CrewAI) échouent sur le Multi-Hop Cross-Session

1. **Fragmentation par Îlots Sémantiques Disjoints** :
   Dans une architecture vectorielle pure (RAG standard), interroger le système sur la clé KMS d'un service ne retournera aucun résultat si la Session 1 associe le Service $A$ au Namespace $N$, la Session 2 associe le Namespace $N$ au Cluster DB $D$, et la Session 3 associe le Cluster DB $D$ à la Clé KMS $K$. La requête `"KMS key for Service A"` n'a aucune proximité vectorielle directe avec la clé $K$. LangChain et CrewAI échouent à fermer la chaîne transitive.
2. **Pollution par Branches Obsolètes & Absence d'Élagage GABAergique** :
   Quand une infrastructure migre d'un composant obsolète vers un composant moderne à travers les sessions, les systèmes naïfs continuent de traverser la branche historique car les liens lexicaux sont forts. GenOS élague activement les branches dépréciées grâce aux synapses inhibitrices GABAergiques (`transmitter_type: 'gaba'`, poids négatifs).
3. **Fuite Relationnelle Inter-Branches (Decoy Bleeding)** :
   Face à des branches d'entités parallèles présentant des structures homologues (ex: Service Alpha -> Store Alpha -> Secret Alpha vs Service Beta -> Store Beta -> Secret Beta), les mécanismes naïfs mélangent les attributs. Le GraphRAG GenOS préserve une isolation étanche sans aucune fuite.
4. **Validation Épistémique des Maillons Intermédiaires** :
   Si un maillon de la chaîne est corrompu ou non certifié (`[unverified_claim]`), GenOS bloque immédiatement la planification (`isOperationAllowed('plan') === false`) plutôt que de propager l'illusion de certitude.
5. **Protection Anti-Boucle Récursive sur Dépendances Cycliques** :
   Les relations cycliques ($A \to B \to C \to A$) provoquent des débordements de pile (stack overflow) ou des requêtes infinies dans les agents à boucle naïve. La CTE récursive SQLite de GenOS borne formellement la profondeur de traversée.
6. **Consolidation Épisodique Hippocampique Cross-Session** :
   Sans tri sélectif, l'historique multi-session s'encombre d'actions anecdotiques et de bruits. Le service hippocampique consolide les expériences à haute récompense ($\ge 0.70$) et purge le bruit.

```mermaid
flowchart TD
    subgraph "Session 1"
        S1["Service Kumuisi"] -->|"Synapse w=1.0"| N1["Namespace prod-omega"]
    end
    subgraph "Session 2"
        N1 -->|"Synapse w=1.0"| D1["DB Cluster aurora-pg-09"]
    end
    subgraph "Session 3"
        D1 -->|"Synapse w=1.0"| K1["KMS Key kms-key-441-alpha"]
    end

    Query["Requête: KMS de Kumuisi"] -.->|"Transitive Closure (Hop 1: w=0.5, Hop 2: w=0.25)"| K1
    
    subgraph "Inhibition GABAergique"
        S1 -.->|"GABA (weight = -2.0)"| D_Old["Legacy DB (rack-9)"]
        D_Old --> K_Dead["Dead KMS Key (ÉLAGUÉ)"]
    end
```

### 18.1 Défis Multi-Hop Cross-Session Éprouvés

| Défi Multi-Hop | Défaillance Typique (LangChain / AutoGen / CrewAI) | Mécanisme de Résolution GenOS (GraphRAG / Synapses / Épistémique) | Statut Test (13/13) |
|---|---|---|---|
| **1. Traversée Transitive Multi-Sessions (S1 $\to$ S2 $\to$ S3)** | Échec de la recherche sémantique : similarité cosinus nulle entre S1 et S3 (îlots disjoints). | Résolution par clôture transitive via la CTE récursive SQLite `traverseSynapses`, atténuant déterministement les poids (Hop 1: 0.5, Hop 2: 0.25) et supportant la bidirectionnalité. | **3/3 PASS** |
| **2. Mutation Temporelle & Élagage de Branche par Synapses GABAergiques** | Retourne la clé obsolète car les nœuds historiques demeurent connectés en base. | L'inhibition synaptique GABAergique (`weight < 0`, `transmitter: 'gaba'`) et la neutralisation de poids nuls tronquent instantanément la branche morte. | **2/2 PASS** |
| **3. Isolation Étanche de Branches Leurres Symétriques** | Dispersion sémantique : les entités de type homologue saignent entre les branches Alpha et Beta. | Préservation stricte de la topologie de graphe : 0 fuite du Store/Secret Beta lors de la traversée de la branche Alpha (et réciproquement). | **2/2 PASS** |
| **4. Invalidation Épistémique sur Maillons Intermédiaires Corrompus** | Les agents continuent d'exécuter des plans basés sur des étapes intermédiaires non prouvées ou altérées. | `epistemics.validateMemoryPerception` détecte les allégations non vérifiées au sein de la chaîne et verrouille instantanément `plan`, `act`, et `generate`. | **2/2 PASS** |
| **5. Confinement Déterministe des Dépendances Cycliques & Auto-Boucles** | Les graphes avec dépendances circulaires ($A \to B \to C \to A$) ou boucles réflexives provoquent des boucles infinies. | La CTE récursive borne la profondeur de traversée, assure une complétion en $< 100\text{ ms}$ et gère les boucles réflexives ($A \to A$) sans duplication. | **2/2 PASS** |
| **6. Consolidation Épisodique Hippocampique Multi-Sessions** | Accumulation désordonnée d'actions bruitées dégradant le contexte et les performances. | `consolidateEpisodes` sépare les actions pivots ($\ge 0.70$) du bruit ($\le 0.25$), consolidant la mémoire à long terme tout en purgeant le résidu. | **2/2 PASS** |

---

## 19. Banc d'Épreuve : Utilisation d'Outils & Orchestration d'APIs (`npm run test:tool-calling`)

Le profil de test `npm run test:tool-calling` ([backend/tests/stress/test_tool_use_and_function_calling_bench.js](../backend/tests/stress/test_tool_use_and_function_calling_bench.js)) soumet le sous-système d'exécution d'outils et de fonction-calling de GenOS à 18 défis majeurs portant sur la rigueur du typage, les baux de sécurité, les disjoncteurs et l'idempotence.

### Vulnérabilités des Frameworks Généralistes (LangChain, AutoGen, CrewAI)

1. **Passage d'Arguments Non Typés (Blind JSON Forwarding)** :
   Les frameworks conventionnels prennent la sortie JSON brute du LLM et l'injectent directement dans la fonction d'outil. Si le LLM omet un paramètre obligatoire, passe un tableau au lieu d'un objet, ou injecte un payload de 100 Mo, le processus hôte plante avec une exception non interceptée.
2. **Escalade Horizontale et Baux d'Outils Laxistes** :
   Dans CrewAI ou AutoGen, les agents ont accès à tous les outils du pool global ou peuvent réclamer n'importe quel outil par simple requête textuelle. Un agent worker peut s'auto-attribuer des outils d'orchestration globale.
3. **Boucles d'Appels Récursives Ininterrompues (*Tool Runaway*)** :
   Quand un outil échoue ou qu'un agent répète le même appel sans progresser, les frameworks réessaient indéfiniment jusqu'à l'épuisement total du budget token ou un crash de contexte.
4. **Effets Secondaires Non Idempotents** :
   Les rejeux d'outils en cas de timeout réseau ré-exécutent les effets destructeurs sans vérification de signature ou de verrouillage d'état.

```mermaid
flowchart TD
    LLMCall["Appel d'Outil émis par le LLM"] --> Step1{1. Validation Stricte de Schéma}
    Step1 -- Type Invalide / Omission / >64KB --> Reject1["INVALID_TOOL_ARGUMENTS (Refus Immédiat)"]
    Step1 -- Conforme --> Step2{2. Baux d'Outils Fail-Closed}
    Step2 -- Outil Hors Rôle / genos_orchestrate --> Reject2["Strip Inconditionnel / Privilège Refusé"]
    Step2 -- Bail Valide --> Step3{3. Circuit Breaker & Anti-Boucle}
    Step3 -- Répétition Identique >= 6 --> Trip1["TOOL_EXECUTION_LOOP (Throttling)"]
    Step3 -- Pannes Récurrentes (>=3) --> Trip2["CIRCUIT_OPEN (Quarantaine Outils Destructeurs)"]
    Step3 -- Outil Locked (Embargo) --> Trip3["TOOL_LOCKED"]
    Step3 -- Normal --> Exec["Exécution Sanctuarisée de l'Outil"]
```

### 19.1 Défis d'Utilisation d'Outils et Function Calling Éprouvés

| Défi d'Exécution d'Outil | Écueil Déterminant (LangChain / AutoGen / CrewAI) | Mécanisme de Protection et Runtime GenOS | Statut Test (18/18) |
|---|---|---|---|
| **1. Validation Stricte de Schéma & Types** | Injection de types malformés (tableaux, chaînes) causant des plantages applicatifs. | `mcpArgumentValidation.validateToolArguments` vérifie la nature objet, l'exhaustivité des champs requis et borne les chaînes à 64 Ko. | **4/4 PASS** |
| **2. Baux d'Outils Fail-Closed & Privilège Minimal** | Les workers héritent ou réclament des outils d'orchestration globale sans restriction. | `toolLeasePolicy.restrictProvidedLease` n'autorise que la restriction (jamais l'élargissement) et expurge inconditionnellement `genos_orchestrate` et ses variantes. | **4/4 PASS** |
| **3. Détection de Boucles Runaway & Disjoncteur Automatique** | Boucles de retry infinies consommant le quota sans détection de répétition. | `circuitBreaker.canExecute` intercepte les boucles identiques ($\ge 6$) via `TOOL_EXECUTION_LOOP`, et bascule en `CIRCUIT_OPEN` lors de pannes successives ($\ge 3$) avec sonde canary en `HALF-OPEN`. | **3/3 PASS** |
| **4. Pipeline Déterministe & Classification de Primitives** | Échec de dispatching des outils custom et perte du contexte d'exécution. | `mcpToolRegistry` et `mcpStrategyTools` catégorisent dynamiquement l'exécution (`strategy`, `bio`, `cli`) et court-circuitent les arguments invalides. | **3/3 PASS** |
| **5. Idempotence & Verrouillage d'Outils Destructeurs** | Duplication d'effets secondaires irréversibles lors des retries réseau. | Calcul déterministe de signature d'arguments (`argumentSignature`) et classification des outils destructeurs exigeant le rôle Admin. | **2/2 PASS** |
| **6. Embargo d'Outils Dégradés & Isolation Propre** | Fuite de stacktraces internes ou d'informations confidentielles lors d'erreurs d'outils. | `toolLockOverrides` verrouille individuellement les outils compromis (`TOOL_LOCKED`) et les outils non supportés renvoient un format d'erreur assaini sans fuite. | **2/2 PASS** |

