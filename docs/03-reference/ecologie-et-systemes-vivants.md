# Écologie et Systèmes Vivants — Référence technique

> Couverture des modules biomimétiques de GenOS qui implémentent les primitives écologiques, de signalisation et de transport zero-texte entre agents.

## Bus de Signalisation Biomimétique

Le bus zero-texte remplace les échanges textuels verbeux entre agents par des signaux physico-chimiques compacts. Cf. §"Bus de Signalisation Biomimétique" dans `runtime-agentique.md`.

### Modules implémentés

- `backend/src/services/biomimeticSignalingBus.js` — types de signal (SIGNAL_TYPES : LIGAND, VOLTAGE, PHEROMONE, PLASMID, TENSOR, TEXT), évaluation ligand-récepteur, consensus électrocyte + Kuramoto, gradient chimiotactique, formatage pour transport
- `backend/src/services/mcpLigandReceptorService.js` — récepteurs catalytiques par outil MCP, cnidocyte reflex (détection de toxine <3µs), seuils Gibbs free energy ΔG
- `backend/src/services/signalingTransportService.js` — persistance des signaux zero-texte dans `signal_blobs` (SQLite WAL), diffusion locale via Map, abonnements (`signal_subs`), nettoyage TTL, readSignalsForAgent/markSignalsSeen, routage collectif via collectiveSignalOrganizationRouter
- `backend/src/services/collectiveSignalOrganizationRouter.js` — routage des signaux zero-texte vers organisations et orchestrateurs, extraction de topic par préfixe SIGNAL_TOPIC_PREFIXES, distribution multi-recipients
- `backend/src/services/agentCollaborativeDecisionMakingService.js` — décision collective électrocyte (vote par potentiel de membrane), suivi chimiotactique (gradient phéromones), transfert plasmid HGT, orchestrateur multi-topologie
- `backend/src/db/schema-next.js` — migration v45 : tables `signal_blobs`, `signal_subs`, indexes, enregistrée dans le registre des migrations (021-signal-transport) via `backend/src/db/migrations/migrateSignalTransport.js`
- `backend/src/services/mcpBioTools/handlers/signalTransport.js` — 7 handlers MCP : genos_signal_publish, genos_signal_read, genos_signal_purge, genos_signal_electrocyte_vote, genos_signal_chemotactic_follow, genos_signal_plasmid_transfer, genos_signal_collective_decision

### Primitives écologiques

Les primitives écologiques sont implémentées dans les handlers MCP et les services Rust :

- **Stigmergie** : `backend/src/services/mcpBioTools/handlers/stigmergy.js` + `crates/genos-signal/src/stigmergy.rs` — dépôt de phéromones, sélection de sentiers, évaporation, champ vectoriel
- **HGT / Transfert Horizontal de Gènes** : `backend/src/services/mcpBioTools/handlers/evolutionAssimilatePlasmid.js` + `crates/genos-biology/src/specialized_cells/prokaryote.rs` — conjugaison de plasmides, absorption bdelloïde
- **Electrocytes / Potentiels de membrane** : `crates/genos-biology/src/specialized_cells/electrocyte.rs` — consensus par sommation de décharges, ordre de phase Kuramoto
- **Cnidocyte / Défense réflexe** : `crates/genos-biology/src/specialized_cells/cnidocyte.rs` + `backend/src/services/mcpLigandReceptorService.js` — détection de toxine en <3µs, harpooning balistique
- **Ligands Paracrines** : `crates/genos-signal/src/cascade.rs` — récepteurs membranaires, seuils de concentration, cascades d'activation
- **Thérapies / Chélation** : `crates/genos-biology/src/therapy.rs` — réponse aux toxines, détoxification, régénération
- **Organismes cellulaires** : `crates/genos-cell/src/lib.rs` + `crates/genos-core/src/cell/methods.rs` — mitochondries, ATP, organelles
- **Génomes / CRISPR** : `crates/genos-genome/src/genome.rs` + `crates/genos-genome/src/gene.rs` — édition génomique, plasmides, croisement

### Organisations dynamiques

- `backend/src/services/dynamicOrganizationService.js` — organisations dynamiques, routing, message channels, transitions de structure (hub-and-spoke, quorum, adversarial triangle, stigmergy)
- `backend/src/services/swarmStigmergyVectorService.js` — champ vectoriel de stigmergie swarm, décroissance exponentielle, routage par gradient

### État adaptatif et apprentissage

- `backend/src/services/adaptiveStateService.js` — état adaptatif (Q-values, attractions, stigmergie), persistance dans SQLite, bootstrap depuis état précédent
- `backend/src/services/primitiveHandlers/memoryStdp.js` — STDP (Spike-Timing-Dependent Plasticity) pour apprentissage synaptique temporel
- `backend/src/services/primitiveHandlers/evolution.js` + `evolutionSpeciation.js` — primitives d'évolution, spéciation, reproduction
- `backend/src/services/primitiveHandlers/collective.js` + `collectiveHelpers.js` — primitives collectives (quorum, phéromones, swarm)

### Matrice de connaissances structurelles

- `backend/src/services/structuralKnowledgeGraph.js` — graphe de connaissances structurel, relations entre concepts, consolidation
- `backend/src/services/structuralConsolidationService.js` — consolidation de connaissances, détection de doublons, agrégation
- `backend/src/services/structuralPlasticityIndex.js` — index de plasticité structurelle, métriques d'adaptation
- `backend/src/services/primitiveHandlers/structuralPlasticity.js` — activation de plasticité structurelle, hooks, handlers dédiés

### Frontière d'Incompressibilité

Le texte est strictement réservé aux interactions avec l'utilisateur humain et à la synthèse de code source imposée par la contrainte de génération du LLM. Tous les états intermédiaires de coordination circulent sous forme de signaux physico-chimiques compacts.

## Limites

- **Transport zero-texte implémenté mais non-branché aux handlers existants** : les 39 handlers utilisent encore `runGenosSync` (CLI Rust local) pour l'exécution. Les signaux zero-texte peuvent être publiés via `signalingTransportService.publishSignal()` mais les handlers ne les utilisent pas nativement — c'est une couche parallèle implémentée mais non-intégrée.
- **`collectiveSignalDecisions.js` non implémenté** : référencé dans la liste §2 comme absent — les décisions collectives sont gérées par `agentCollaborativeDecisionMakingService.js` (orchestrateur) au lieu d'un service de décisions dédié.

Le nettoyage CAS et le mark-and-sweep du DAG sont désormais exécutables via les
primitives `cas_gc` et `dag_mark_sweep`. Le CAS exige un `casRoot` contenant des
références JSON sous `refs/`; le DAG utilise les racines explicites
`rootNodeIds` ou les nœuds sans parent. Les deux opérations commencent en
`dryRun` (`dag_mark_sweep` utilise `prune: false`) et ne suppriment qu'après une
demande explicite. Une simulation retourne `status: simulated` et ne constitue
pas un succès opérationnel.
- **Registres en mémoire** : la plupart des handlers utilisent des `Map` module-level perdus au redémarrage.
- **Pas de persistance relationnelle cross-agent** : les relations chimeriques, jumeaux, plasmides sont en mémoire.
- **Codex local requis** : les handlers appellent `genos biomimicry ...` via `runGenosSync` — si le binaire Rust n'est pas disponible, les handlers retournent `tool_error`.
- **Aucune intégration agents→transport dans les handlers existants** : les 39 fichiers handlers ne publient pas de signaux zero-texte — ils utilisent le CLI Rust. La couche transport est disponible mais non-consommée par les handlers actuels.
