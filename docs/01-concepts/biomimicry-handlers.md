# Biomimicry Handlers — Récapitulatif des 39 primitives

> Statut : toutes les primitives listées dans le diagramme runtime-agentique.md §5 sont implémentées dans `backend/src/services/mcpBioTools/handlers/`. Le schéma de transport inter-agents zero-texte (`biomimeticSignalingBus.js`, `mcpLigandReceptorService.js`) est implémenté et branché à la couche de transport persistante (`signalingTransportService.js`, migration v45 signal_blobs/signal_subs). AgentCollaborativeDecisionMakingService orchestre les décisions collectives. C'est du progressed spec/open-code, pas du produit fermé.

## Dispath MCP

- **Entrée** : `mcpToolRegistry.js` détecte la catégorie `bio` et dispatche vers `mcpBioTools.executeBioTool()`
- **Dispatch** : `mcpBioTools.js` cherche `TOOL_HANDLERS[toolName]` et appelle `handler.handle(args, runGenosSync)`
- **39 fichiers handlers** dans `backend/src/services/mcpBioTools/handlers/`, tous exportés dans `index.js` via `TOOL_HANDLERS`

## Les 39 handlers du diagramme §5

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
- `backend/src/services/signalingTransportService.js` — persistance des signaux zero-texte dans `signal_blobs` (SQLite WAL), diffusion locale via Map, abonnements (`signal_subs`), nettoyage TTL, readSignalsForAgent/markSignalsSeen
- `backend/src/services/agentCollaborativeDecisionMakingService.js` — décision collective électrocyte (vote par potentiel de membrane), suivi chimiotactique (gradient phéromones), transfert plasmid HGT, orchestrateur multi-topologie
- `backend/src/db/schema-next.js` — migration v45 : tables `signal_blobs`, `signal_subs`, indexes, enregistrée dans le registre des migrations (021-signal-transport)

Schéma d'architecture transport :

```
Agents / Orchestrateur / MCP
  → registerSignalTransportTools()  [gens biologiques MCP]
  → executeBioTool(toolName, args)  [dispatch handler]
  → handler.handle(args, runGenosSync)  [logique métier]
  → signalingTransportService.publishSignal()  [persistance signal_blobs]
  → biomimeticSignalingBus.evaluate*()  [calculs zero-texte]
  → MCP response (signalBlob + content)
```

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

Tous les 91 outils MCP enregistrés dans `backend/src/db/seedTools.js` sont dispatchables via ce schéma. Les 39 handlers biomimétiques sont les plus nombreux, couvrant neurobiologie, génétique, temporalité, écologie, résilience et security.

## Limites

- **Transport zero-texte implémenté mais non-branché aux handlers existants** : les 39 handlers utilisent encore `runGenosSync` (CLI Rust local) pour l'exécution. Les signaux zero-texte peuvent être publiés via `signalingTransportService.publishSignal()` mais les handlers ne les utilisent pas nativement — c'est une couche parallèle implémentée mais non-intégrée.
- **Persistance SQLite uniquement** : pas de Redis pub/sub, pas de broadcast cluster-wide au-delà du processus Node local. Le transport est local au processus backend.
- **Registres en mémoire** : la plupart des handlers utilisent des `Map` module-level (ex: `FETUS_REGISTRY`, `DIAPAUSE_REGISTRY`) perdus au redémarrage.
- **Pas de persistance relationnelle cross-agent** : `crossAgentRelationalPrimitives.js` est mentionné dans le spec mais n'existe pas encore — les relations chimeriques, jumeaux, plasmides sont en mémoire.
- **Codex local requis** : les handlers appellent `genos biomimicry ...` via `runGenosSync` — si le binaire Rust n'est pas disponible, les handlers retournent `tool_error`.
- **Aucune intégration agents→transport dans les handlers existants** : les 39 fichiers handlers ne publient pas de signaux zero-texte — ils utilisent le CLI Rust. La couche transport est disponible mais non-consommée par les handlers actuels.
