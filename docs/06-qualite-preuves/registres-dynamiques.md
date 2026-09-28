# Registres dynamiques et appels construits par configuration

Complément à l'[inventaire d'atteignabilité](inventaire-atteignabilite-services.md) :
le scanner ne suit que les imports relatifs littéraux. Les mécanismes ci-dessous chargent
ou sélectionnent du code au runtime à partir de noms, de configuration ou de la mission.
Un service sans import littéral mais atteignable par l'un de ces chemins est un
**candidat à examiner**, pas un défaut avéré ; un service hors de tous ces chemins reste
`à classer` (cf. [statuts](statuts-maturite.md)), jamais `inutile` par défaut.

Constat structurant : l'import littéral ne prouve ni sélection pendant une mission, ni
effet sur une décision. L'audit fonctionnel suit la
[matrice de câblage](wiring-matrix.md), pas le graphe d'imports.

## 1. Dispatch MCP par nom d'outil (configuration + lease)

- `backend/src/services/mcpExecutor/transports/toolLogic.js` — `executeToolLogic`
  sélectionne le handler selon le **nom de l'outil demandé** : table
  `CUSTOM_TOOL_HANDLERS` (ex. `genos_biological_mode`, `genos_topology_session`,
  `genos_replay`), puis `executeBioTool` (`mcpBioTools`), `executeStrategyTool`
  (`mcpStrategyTools`), `executeGenomeTool` (`mcpGenomeTools`), puis transport
  `http`/`stdio` configuré. Les `require` sont littéraux mais la **sélection est
  pilotée par la requête et la lease**, pas par une chaîne d'imports statique.
- `backend/src/services/mcpExecutor/dispatch.js` — `preValidateTool` : registre +
  lease + schéma avant tout dispatch ; un outil absent du registre ou hors lease est
  refusé, pas chargé.
- `backend/src/services/mcpToolRegistry.js` (+ `backend/src/db/seedTools.js`,
  `MCP_TOOLS_LIST`, 176 entrées) — registre de dispatch runtime distinct des 36
  définitions publiques des catalogues.

## 2. Adaptateur philosophie (chargement par nom validé)

- `backend/src/services/philosophyRouter.js:106-119` — `callService` fait
  `require('./' + serviceName)` avec méthode vérifiée contre `allowedMethods`.
  Le nom du service vient du concept enregistré (`concept.service`), pas d'un import.
  Les concepts sans adaptateur exécutable retournent `unavailable` (`executable: false,
  supported: false`) au lieu de charger quoi que ce soit.

## 3. Registres de stratégies, primitives et topologies

- `backend/src/strategies/strategyRegistry.js` — familles de stratégies consommées via
  `listStrategies()` (`capabilityGraphService.js`, `autonomousOrchestrationService`,
  92 stratégies déclarées) ; exécution via `strategyExecutionAdapter`.
- `backend/src/services/primitiveHandlers/handlersRegistry.js` — `HANDLERS` consommés
  par `capabilityGraphService.js` ; 255 références de primitives au registre.
- `backend/src/services/aTeam/variants/variantRegistry.js` — `buildVariantPlan`
  consommé par `dispatchPolicyService.js` et `aTeamMorphogenesisBridge.js`.
- `backend/src/services/agents/phenotypeRegistryService.js` — phénotypes et profils
  d'autorité par `workerKind` (`getPhenotype`, `getAuthorityProfile`, `canSpawn`).
- `backend/src/services/agents/instinctRuntimeService.js:170-256` — registre
  d'instincts mutable au runtime (`registerInstinct`).

## 4. Registres daemon, épistémiques et biologiques

- `backend/src/services/daemon/daemonReceptorRegistry.js` — récepteurs par type
  d'événement (`daemonEventBridgeService.js`, ADR 0034 D3) ; événement inconnu refusé.
- `backend/src/services/daemon/investigation/anomalyDetectorRegistry.js` —
  détecteurs par identifiant (`residentInvestigatorService.js`, `verifierService.js`).
- `backend/src/services/conceptRegistryService.js` — registre canonique des concepts
  consommé par `philosophyRouter.js`.
- `backend/src/services/adaptiveStateBootstrap.js:85-91` — restauration persistée des
  registres biomimétiques (`restoreMap('mcp_bio::…')`) dans les handlers chargés.

## 5. Chargements pilotés par identifiant (fixtures, pont Rust)

- `backend/src/services/comparativeMissionFixtureService.js:21` —
  `require(path.join(FIXTURE_ROOT, id + '.json'))` : fixture choisie par identifiant.
- Ponts Node ↔ Rust via `genosCli` (`runGenosSync`) et transports `http`/`stdio`
  (`mcpExecutor/transports/`) : commandes et arguments autorisés construits au runtime,
  reçus typés seulement sur le pont snapshot (cf. matrice §11).

## 6. Conséquence pour l'audit

Avant de déclarer un service sans import littéral `obsolète`, vérifier dans l'ordre :
mention nominale en production, présence dans l'un des registres ci-dessus, chargement
dynamique connu (§2, §5), usage en tests uniquement, puis seulement conclure. La triple
preuve d'absence (zéro import littéral, zéro mention nominale en production, zéro
chargement dynamique connu) est exigée par les [statuts de maturité](statuts-maturite.md).
