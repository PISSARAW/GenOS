# Biomimicry Handlers — Primitives biomimétiques documentées

> Statut : les handlers listés dans le diagramme runtime-agentique.md §5 sont présents dans `backend/src/services/mcpBioTools/handlers/`. Le transport zero-texte passe par la publication inter-agents de l'organisation ; le handler de stigmergie publie aussi les dépôts en signaux quand `orchestrator_id` est fourni. Les autres opérations locales ne convertissent pas automatiquement leurs résultats en signaux.

## Dispath MCP

- **Entrée** : `mcpToolRegistry.js` détecte la catégorie `bio` et dispatche vers `mcpBioTools.executeBioTool()`
- **Dispatch** : `mcpBioTools.js` cherche `TOOL_HANDLERS[toolName]` et appelle `handler.handle(args, runGenosSync)`
- Les primitives de cette page sont décrites dans le diagramme runtime-agentique §5. Le nombre de clés effectivement enregistrées dans `TOOL_HANDLERS` et le nombre de fichiers source sont distincts ; vérifier le registre de dispatch dans [la référence MCP](../03-reference/outils-mcp.md) et le code de `mcpToolRegistry.js`.

## Les handlers décrits dans le diagramme §5

### Neurobiologie & Syncrotisation

1. **thalamicBridge** — Pont sensoriel zero-copy entre agents jumeaux craniopages (H1 du diagramme)
2. **cryptophasia** — Compression opcode dialectique dense (70–85% tokens) avec chaperone épistémique d'audit (H2)
3. **mirrorTwinFork** — Fork counterfactual symétrique créant des paires constructives/adversariales (H3)
4. **somaticResonance** — Télémétrie de stress et propagation d'onde d'entropie collective syncytiale (H4)
5. **chimericMerge** — Fusion mosaïque tétragamétique combinant génome outils + mémoire immunitaire (H5)
6. **polyovulationSpawn** — Spawn de flotte hétérozygote multi-zygotes (H6)
7. **monozygoticSplit** — Clivage précoce en clones MCTS isogoniques (H7)
8. **hybridMultiples** — Matrice cluster hiérarchique combinant polyovulation + clivage (H8)
9. **conjoinedTwinBind** — Liaison viscérale profonde, pool de tokens partagé, verrou de survie mutuelle (H9)
10. **parasiticGraft** — Assimilation autosite des outils auxiliaires du jumeau arrêté en membres zero-cost (H10)
11. **fetusInFetu** — Encapsulation endoparasitaire + réanimation d'urgence du pod de rescue (H11)
12. **sesquizygoticSplit** — Split dispermique 100% invariants maternels + 50% traits paternels (75% similarité) (H12)
13. **heteropaternalSuperfecundation** — Spawn de demi-frères multi-fournisseurs maximisant la diversité cognitive (H13)
14. **superfetationPipeline** — Pipeline de co-gestation asynchrone multi-stades avec héritage du cache de connaissances (H14)
15. **tissueChimerism** — Agent monolithique à lignées ADN compartimentées (réseau vs filesystem) (H15)
16. **obligatePolyembryony** — Clivage déterministe obligatoire en quadruplets isogoniques avec quorum 75% (H16)
17. **marmosetGermlineChimerism** — Transfert germinal inter-jumeaux : un agent procrée pour son frère (H17)
18. **freemartinInhibition** — Inhibition endocrine asymétrique : sterileisation du subordonné + boost de compute (H18)
19. **embryonicDiapause** — Pipeline séquentiel 3-tiers avec dégel zero-latency de la diapause embryonnaire (H19)

### Génétique & Mutation

20. **pointMutation** — Mutation ponctuelle : silencieuse, faux-sens, non-sens STOP (H20)
21. **frameshiftMutation** — Mutation indel + décalage du frame de lecture + pads compensateurs (H21)
22. **chromosomalDeletion** — Pruning structurel du pipeline (H22)
23. **chromosomalDuplication** — Duplication en tandem + néo-fonctionnalisation (H23)
24. **chromosomalInversion** — Inversion rétrograde du raisonnement (H24)
25. **chromosomalTranslocation** — Greffe de capacité cross-agent (H25)
26. **aneuploidy** — Consensus trisomie 2/3 + monosomie (H26)
27. **polyploidy** — Stratégie multi-couches 6n blé (H27)
28. **transposonJump** — Saut cut-and-paste + rétrotransposition (H28)
29. **dynamicTripletExpansion** — Anticipation microsatellite dynamique (H29)
30. **mitochondrialDnaMutation** — Métabolisme énergétique matrilinéaire (H30)
31. **epigeneticMethylation** — Mémoire environnementale réversible (H31)
32. **horizontalGeneTransfer** — Transfert horizontal : plasmides + absorption bdelloid (H32)
33. **agrobacteriumTdnaHijack** — Injection T-DNA + quota gallus (H33)
34. **viralEndogenization** — Intégration rétrovirale KoRV lignée germinale (H34)
35. **tardigradeDsupShield** — Bouclier invariant mécanique Dsup (H35)
36. **turritopsisTransdifferentiation** — Rétro-différenciation adulte→polype (H36)
37. **yamanakaReprogramming** — Facteurs OSKM, reprogrammation stem (H37)

### Temporalité & Cognition

38. **consciousnessTransfer** — Rejeu de conscience avec mémoire future (H38)
39. **novikovCausalRebase** — Rebasing causal Novikov zero-paradoxe (H39)

## Couche de transport zero-texte

Les modules suivants implémentent le schéma de transport inter-agents décrit dans le §"Bus de Signalisation Biomimétique" du runtime-agentique.md :

- `backend/src/services/biomimeticSignalingBus.js` — types de signal (SIGNAL_TYPES : LIGAND, VOLTAGE, PHEROMONE, PLASMID, TENSOR, TEXT), évaluation ligand-récepteur, consensus électrocyte + Kuramoto, gradient chimiotactique, formatage pour transport
- `backend/src/services/mcpLigandReceptorService.js` — récepteurs catalytiques par outil MCP, cnidocyte reflex (détection de toxine <3µs), seuils Gibbs free energy ΔG
- `backend/src/services/signalingTransportService.js` — persistance des signaux zero-texte dans `signal_blobs` (SQLite WAL), diffusion immédiate via une Map locale au processus, abonnements (`signal_subs`), nettoyage TTL, readSignalsForAgent/markSignalsSeen, routage collectif via collectiveSignalOrganizationRouter. SQLite conserve les lignes ; aucun mécanisme de notification ou de diffusion inter-instance n'est implémenté.
- `backend/src/services/collectiveSignalOrganizationRouter.js` — routage des signaux zero-texte vers organisations et orchestrateurs, extraction de topic par préfixe SIGNAL_TOPIC_PREFIXES, distribution multi-recipients
- `backend/src/services/agentCollaborativeDecisionMakingService.js` — décision collective électrocyte (vote par potentiel de membrane), suivi chimiotactique (gradient phéromones), transfert plasmid HGT, orchestrateur multi-topologie
- `backend/src/db/schema-next.js` — migration v45 : tables `signal_blobs`, `signal_subs`, indexes, enregistrée dans le registre des migrations (021-signal-transport) via `backend/src/db/migrations/migrateSignalTransport.js`
- `backend/src/services/mcpBioTools/handlers/signalTransport.js` — 7 handlers MCP : genos_signal_publish, genos_signal_read, genos_signal_purge, genos_signal_electrocyte_vote, genos_signal_chemotactic_follow, genos_signal_plasmid_transfer, genos_signal_collective_decision

Schéma d'architecture transport :

```
Chemin de publication organisationnelle
  Agent → genos_worker_publish → dynamicOrganizationService.publish()
        → inbox de l'organisation

Chemin de stigmergie
  Appel MCP → handler stigmergy → CLI Rust (dépôt local)
                              └→ si orchestrator_id + agent_id :
                                 dynamicOrganizationService.publish()

Chemin des autres handlers
  Appel MCP → handler local → CLI Rust / service spécialisé → réponse MCP
                         (pas de publication automatique au transport)

Outils genos_signal_*
  Appel MCP → handler signalTransport → signalingTransportService
                                      → persistance / lecture de signaux
```

Ce schéma distingue les outils explicites `genos_signal_*` des handlers
biomimétiques locaux. `signalingTransportService.publishSignal()` n'est pas
une étape commune du dispatch MCP ; l'intégration au canal d'organisation
utilise `dynamicOrganizationService.publish()`.

## Schéma de pipeline d'exécution MCP

```
Clients (Agents / Orchestrateur / CLI / REST)
  → Registry (isRegisteredTool, detectExecutionKind)
  → Circuit Breaker
  → dispatchTool (kind = 'bio')
    → mcpBioTools.executeBioTool(toolName, args)
      → TOOL_HANDLERS[toolName].handle(args, runGenosSync)
      → handler.error(e) en cas d'exception
```

Les outils biomimétiques sont dispatchés via ce schéma. Les handlers couvrent neurobiologie, génétique, temporalité, écologie, résilience et sécurité ; ceux qui exécutent une opération locale conservent leur transport local.

## Limites

- **Intégration sélective** : `genos_worker_publish` stocke les signaux dans le canal de l'organisation et le handler `stigmergy` peut publier ses traces comme phéromones avec `orchestrator_id`. Les autres handlers n'émettent pas automatiquement leurs résultats sur ce transport.
- **Portée de diffusion** : la diffusion immédiate via `LOCAL_BROADCAST_LOG` est limitée au processus Node courant. Les signaux persistés dans SQLite peuvent être relus par un processus qui accède à la même base, mais il n'existe ni notification inter-processus, ni mécanisme de livraison cluster-wide ; la persistance partagée ne constitue donc pas une diffusion entre instances.
- **Registres en mémoire** : la plupart des handlers utilisent des `Map` module-level (ex: `FETUS_REGISTRY`, `DIAPAUSE_REGISTRY`) perdus au redémarrage.
- **Relations cross-agent** : le service `crossAgentRelationalService.js` persiste dans SQLite les liens chimériques, jumeaux, parent-enfant et plasmidiques produits par les handlers de fusion chimérique, jumeaux conjoin(t)s/sesquizygotiques, chimérisme germinal et promotion plasmidique. Cette table de relations est durable ; les registres de détails de chaque handler restent distincts et peuvent encore dépendre de leur persistance adaptative.
- **Codex local requis** : les handlers appellent `genos biomimicry ...` via `runGenosSync` — si le binaire Rust n'est pas disponible, les handlers retournent `tool_error`.
