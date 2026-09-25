# Biomimicry Handlers — Primitives biomimétiques documentées

> Statut : les handlers listés dans le diagramme runtime-agentique.md §5 sont présents dans `backend/src/services/mcpBioTools/handlers/`. Le transport zéro-texte passe par la publication inter-agents de l'organisation ; stigmergie et assimilation plasmidique publient aussi un événement borné quand `orchestrator_id` est fourni. Les autres opérations locales ne convertissent pas automatiquement leurs résultats en signaux.

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

> **Documentation complète** : [signal-plane-zero-text.md](./signal-plane-zero-text.md)
> — couvre le pipeline, les services, le schéma DB, les tests et les limites.

Les modules suivants implémentent le transport zero-texte :

- `signalingTransportService.js` — pipeline complet : persist → coalesce → route → EventBus
- `signalReceptorService.js` — registre récepteurs + actions déterministes (emit_signal, wake_worker, update_agent, change_organization)
- `signalEventBus.js` — EventEmitter avec souscription destination-based (`onRecipient`) pour wake-up
- `signalCoalescerService.js` — anti-spam : période réfractaire 2s + coalescing 500ms
- `synapticPlasticityService.js` — poids Hebbien influençant le routage
- `collectiveSignalOrganizationRouter.js` — scope strict (org ET projet), tri par plasticité
- `signalPlaneSubscriber.js` — consumer production EventBus (registerWakeHandler), démarré dans `server.js`
- `schema-next.js` — tables `signal_blobs`, `signal_subscriptions`, `signal_deliveries`

Les outils de signalisation dédiés et les notifications émises par certains
handlers sont deux chemins différents. L'assimilation plasmidique garde son
opération Rust locale ; avec `orchestrator_id`, elle publie seulement
l'identifiant du plasmide assimilé et l'agent receveur dans l'inbox. Le signal
ne transporte ni le code plasmidique ni une capacité exécutable.

Schéma d'architecture transport :

```
Chemin de publication organisationnelle
  Agent → genos_worker_publish → dynamicOrganizationService.publish()
        → inbox de l'organisation

Chemin de stigmergie
  Appel MCP → handler stigmergy → CLI Rust (dépôt local)
                              └→ si orchestrator_id + agent_id :
                                 dynamicOrganizationService.publish()

Chemin d'assimilation plasmidique
  Appel MCP → contrôle agent/orchestrateur → CLI Rust (assimilation locale)
                                           └→ si orchestrator_id :
                                              signal plasmid borné dans l'inbox

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
- **EventBus local** : `signalEventBus` est un EventEmitter en mémoire — les workers d'autres processus Node ne reçoivent pas les notifications push. Le `signalPlaneSubscriber` est le consumer production mais reste local au processus. Pour un vrai multi-process, un transport distribué (Redis, SQLite triggers + polling) serait nécessaire (P3).
- **Coalescing en mémoire** : `signalCoalescerService` maintient les périodes réfractaires et buffers en mémoire — perdu au redémarrage. Pas de coalescing inter-process.
- **Plasticité en mémoire** : `synapticPlasticityService` garde les poids en mémoire (Map). Perdus au redémarrage — pas de persistance SQLite (TODO P3).
- **LLM escalation** : quand `llmRequired=true`, le signal est logué par le subscriber mais pas encore routé vers un service cognitif spécifique (TODO).
- **Registres en mémoire** : la plupart des handlers utilisent des `Map` module-level (ex: `FETUS_REGISTRY`, `DIAPAUSE_REGISTRY`) perdus au redémarrage.
- **Relations cross-agent** : `crossAgentRelationalService.js` fournit le registre durable SQLite et les profils de familiarité, historique partagé, autorité, confiance, indépendance épistémique, corrélation d'erreur et niveau de divulgation. Il couvre les liens de filiation (parents, enfants, fratrie, jumeaux), sociaux (amis, inconnus, voisins, partenaires, rivaux, alliés temporaires), organisationnels (collègues, responsables, mentors, clients, fournisseurs), épistémiques et adversariaux. La création reste explicite : seuls les handlers ou services qui appellent le registre créent des liens, et une relation absente est traitée comme une relation d'inconnus. L'apprentissage communicationnel met à jour le profil durable ; le pare-feu épistémique s'en sert pour évaluer l'indépendance. `relationResolverService.js` expose aussi des fonctions de sélection de vérificateur indépendant et de partenaire d'un type demandé, mais ces fonctions ne sont pas encore branchées aux sélecteurs de runtime. Les profils guident la sélection ; ils ne remplacent pas les preuves exigées pour une décision. Les registres détaillés propres à chaque handler restent distincts.
- **Codex local requis** : les handlers appellent `genos biomimicry ...` via `runGenosSync` — si le binaire Rust n'est pas disponible, les handlers retournent `tool_error`.
