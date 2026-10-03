# Biomimicry Handlers — Catalogue et niveau d'exécution

> **Portée :** les handlers biomimétiques sont des modèles logiciels inspirés de la biologie. La présence d'un handler ou le succès du transport MCP ne prouve pas la création d'un agent, une mutation d'AgentDNA, une exécution biologique ou une preuve empirique. Les handlers listés ici ne doivent pas être confondus avec les primitives Rust d'AgentDNA et de reproduction documentées dans [reproduction-et-replication.md](../02-orchestration/reproduction-et-replication.md).

Le transport zéro-texte passe par la publication inter-agents de l'organisation ; stigmergie et assimilation plasmidique publient aussi un événement borné quand `orchestrator_id` est fourni. Les autres opérations locales ne convertissent pas automatiquement leurs résultats en signaux.

## Dispath MCP

- **Entrée** : `mcpToolRegistry.js` détecte la catégorie `bio` et dispatche vers `mcpBioTools.executeBioTool()`
- **Dispatch** : `mcpBioTools.js` cherche `TOOL_HANDLERS[toolName]` et appelle `handler.handle(args, runGenosSync)`
- Les primitives de cette page sont décrites dans le diagramme runtime-agentique §5. Le nombre de clés effectivement enregistrées dans `TOOL_HANDLERS` et le nombre de fichiers source sont distincts ; vérifier le registre de dispatch dans [la référence MCP](../03-reference/outils-mcp.md) et le code de `mcpToolRegistry.js`.

## Les handlers décrits dans le diagramme §5

### Neurobiologie & Syncrotisation

1. **thalamicBridge** — Pont sensoriel zero-copy entre agents jumeaux craniopages (H1 du diagramme)
2. **cryptophasia** — Compression opcode dialectique dense (70–85% tokens) avec chaperone épistémique d'audit (H2)
3. **mirrorTwinFork** — Descripteurs constructif/adversarial en mémoire ; aucune branche runtime n'est forkée et aucune promotion n'est autorisée par le score heuristique (H3)
4. **somaticResonance** — Télémétrie de stress et propagation d'onde d'entropie collective syncytiale (H4)
5. **chimericMerge** — Enregistre une configuration de mosaïque ; ne fusionne pas les génomes ni les agents (H5)
6. **polyovulationSpawn** — Enregistre une flotte de descripteurs ; ne déploie pas d'agents (H6)
7. **monozygoticSplit** — Enregistre 2 à 128 descripteurs de clones ; ne lance pas de branches MCTS/runtime (H7)
8. **hybridMultiples** — Enregistre au plus 16 familles et 128 descripteurs par famille ; aucun agent n'est déployé (H8)
9. **conjoinedTwinBind** — Ledger simulé de liaison et de ressources ; aucun runtime partagé n'est créé (H9)
10. **parasiticGraft** — Assimilation autosite des outils auxiliaires du jumeau arrêté en membres zero-cost (H10)
11. **fetusInFetu** — Registre de checkpoint descriptif avec somme de contrôle ; ne sauvegarde/restaure pas de runtime ni ne réanime d'agent (H11)
12. **sesquizygoticSplit** — Descripteurs de deux profils et ratio nominal 75% ; ne calcule pas de similarité génomique réelle (H12)
13. **heteropaternalSuperfecundation** — Descripteurs de 2 à 16 lignées parentales ; aucun agent n'est créé et l'indépendance de biais n'est pas testée (H13)
14. **superfetationPipeline** — Registre d'âges/cache déclaratifs ; aucun agent ne reçoit réellement un cache (H14)
15. **tissueChimerism** — Enregistre une configuration de chimérisme tissulaire ; aucun agent ni routage par lignée n'est créé (H15)
16. **obligatePolyembryony** — Descripteurs de 4 ou 8 clones et votes de quorum liés à des identifiants connus ; aucune exécution parallèle ni promotion runtime (H16)
17. **marmosetGermlineChimerism** — Registre de filiation proxy ; ne transmet pas de génome à une descendance runtime (H17)
18. **freemartinInhibition** — Inhibition endocrine asymétrique : sterileisation du subordonné + boost de compute (H18)
19. **embryonicDiapause** — Pipeline séquentiel 3-tiers avec dégel zero-latency de la diapause embryonnaire (H19)

### Génétique & Mutation

20. **pointMutation** — Modification déclarative d'un registre de séquence ; aucun génome d'agent runtime n'est modifié (H20)
21. **frameshiftMutation** — État de séquence de simulation ; aucune mutation n'est appliquée à AgentDNA/runtime (H21)
22. **chromosomalDeletion** — Pruning structurel du pipeline (H22)
23. **chromosomalDuplication** — Duplication en tandem + néo-fonctionnalisation (H23)
24. **chromosomalInversion** — Inverse une plage valide d'un tableau descriptif ; ce n'est pas un ordonnanceur de raisonnement (H24)
25. **chromosomalTranslocation** — Greffe de capacité cross-agent (H25)
26. **aneuploidy** — Modifie un caryotype descriptif et compte des votes textuels bornés ; n'instancie pas de réplicas (H26)
27. **polyploidy** — Décrit 2, 3, 4, 6 ou 8 couches ; ne change pas le génome et ne les orchestre pas (H27)
28. **transposonJump** — Déplace ou copie des éléments entre loci enregistrés ; cibles allowlistées, plafond 64, sans mutation runtime (H28)
29. **dynamicTripletExpansion** — Fait évoluer un compte répétitif de simulation avec deltas entiers bornés (H29)
30. **mitochondrialDnaMutation** — Registre métabolique déclaratif ; stress fini accepté de 0,1 à 5 inclus, sans effet sur l'énergie runtime (H30)
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

## Contrat réel des modèles de reproduction et mutation

Les handlers biomimétiques Node opèrent sur des registres locaux (persistés lorsque le handler est correctement lié au persister) et retournent des descripteurs/mesures heuristiques. Ces écritures ne modifient pas à elles seules les fichiers AgentDNA, les agents actifs, leurs outils, leurs budgets ou leurs exécutions. Les sorties marquées `execution_scope: metadata_simulation`, `runtime_*: false` ou `promotion_allowed: false` rendent cette frontière explicite.

Les contrôles ajoutés bornent entre autres le nombre de clones monozygotes à 2–128, les familles hybrides à 16 (128 clones/famille), les votes polyembryoniques à un vote par clone connu, les fournisseurs hétéropaternels à 2–16, les budgets polyembryoniques à 1–1 000 000 000, les niveaux de polyploïdie à 2/3/4/6/8 et les copies de transposons à 64. Les scores, ratios et libellés biologiques sont des valeurs de simulation ; ils ne constituent pas des résultats empiriques.

À l'inverse, `genos-dna`, `genos-genome` et `genos-reproduction` fournissent les primitives Rust de génome, fertilisation, crossover, mitose, fission et bourgeonnement. Voir la référence de [reproduction et réplication](../02-orchestration/reproduction-et-replication.md) et la [spécification AgentDNA](../../spec/AGENT_DNA_SPEC.md).

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
- **Plasticité des routes** : `synapticPlasticityService` conserve un cache mémoire des poids et les persiste dans `signal_channel_weights`. `loadWeights()` recharge les canaux avant la sélection d'une cible d'escalade cognitive. Les écritures SQLite asynchrones sont ordonnées; `flushPendingWrites()` permet d'attendre leur fin et remonte le premier échec en attente. Sans appel de vidage, un arrêt brutal peut encore perdre les dernières mises à jour volatiles.
- **Escalade cognitive** : quand `llmRequired=true` et que le gate VoI l'autorise, `signalPlaneSubscriber.js` sélectionne une cible puis appelle `cognitiveSignalService.handleSignal`, qui passe le signal au `modelRouter.generate`. La réponse reste une sortie de modèle ; elle ne vaut ni action exécutée ni preuve vérifiée.
- **Registres** : les handlers utilisent des `Map` module-level. Les handlers d'altération génétique et de reproduction audités (dont `pointMutation`, `frameshiftMutation`, `dynamicTripletExpansion`, les chimérismes, les variantes de jumeaux, `polyovulationSpawn`, `superfetationPipeline`, `fetusInFetu`, `aneuploidy`, `polyploidy`, les mutations chromosomiques/transposon et `mitochondrialDnaMutation`) les lient au persister adaptatif lorsqu'il est configuré. Sans persister, ils restent en mémoire et sont perdus au redémarrage. La persistance d'un registre ne donne pas d'effet au runtime qu'il décrit.
- **Relations cross-agent** : `crossAgentRelationalService.js` fournit le registre durable SQLite et les profils de familiarité, historique partagé, autorité, confiance, indépendance épistémique, corrélation d'erreur et niveau de divulgation. La création reste explicite : seuls les handlers ou services qui appellent le registre créent des liens, et une relation absente est traitée comme une relation d'inconnus. L'apprentissage communicationnel met à jour le profil durable ; le pare-feu épistémique s'en sert pour évaluer l'indépendance. `relationResolverService.js` est relié au planificateur Holobionte, qui expose un choix relationnel parmi les candidats déjà éligibles, et aux affectations épistémiques lorsque le contexte fournit des candidats vérificateurs. Un vérificateur de filiation ou exclu est refusé. Ces profils et classements ne remplacent pas les preuves exigées pour une décision ; les registres détaillés propres à chaque handler restent distincts.
- **Codex local requis** : les handlers appellent `genos biomimicry ...` via `runGenosSync` — si le binaire Rust n'est pas disponible, les handlers retournent `tool_error`.
