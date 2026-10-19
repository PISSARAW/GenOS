# Inventaire canonique actuel des concepts GenOS

- **Statut** : Référence transversale — implémentation hétérogène
- **Portée** : les 23 sections de l'inventaire humain et les 24 domaines du registre machine
- **Dernière revue** : 2026-10-18

## 1. Objet et règle de lecture

Cette page relie l'inventaire conceptuel de GenOS à l'état réellement observable
du dépôt. Elle ne remplace ni les contrats techniques ni les matrices d'audit.
Un concept peut être documenté, résolu par le planificateur ou associé à un
adaptateur sans être une capacité autonome, validée de bout en bout ou éligible à
la promotion.

Les statuts employés ici sont les suivants :

- **Implémenté** : un chemin exécutable et des contrôles ciblés existent dans le dépôt ;
- **Partiel** : une tranche existe, mais la boucle, la preuve indépendante, la
  portabilité ou la qualification de bout en bout reste incomplète ;
- **Contrat** : le terme possède un schéma, un registre ou une règle opposable,
  sans constituer à lui seul une exécution ;
- **Cadre conceptuel** : taxonomie, analogie ou interprétation sans promesse
  d'une capacité logicielle complète.

L'invariant demeure : un transport réussi, un handler appelé ou un statut
technique positif ne prouve pas une décision valide.

## 2. Sources de vérité au 18 octobre 2026

| Registre | État observé | Interprétation |
| --- | ---: | --- |
| Inventaire de l'Ontogenèse | 24 domaines, 711 entrées demandables | `canonicalConceptInventory.js` catalogue les termes ; le résolveur décide ensuite s'ils sont documentaires, contractuels ou raccordés. |
| Topologies canoniques | 8 | Trinity, A-Team, Biocénose, Holobionte, Syncytium, Biome, Rhizome et Métapopulation. Garage Fabric reste transversal. |
| Organisations dynamiques Node | 20 | `cross_functional_pod` s'ajoute aux 19 entrées historiques. Le miroir Rust en expose encore 19 : la parité complète n'est donc pas acquise. |
| Capacités topologiques | 51 | Registre déclaratif ; une capacité requise ne crée ni lease, ni handler, ni preuve. |
| Types de workers | 19 | Kinds contractuels ; un rôle de mission n'est pas automatiquement un worker incarné. |
| Stratégies | 95 `ready` dans le registre | `ready` signifie registre cohérent et primitives déclarées disponibles, pas réussite générale sur mission réelle. |
| Concepts philosophiques | 420 | 195 `reference-only`, 222 `bounded-audit`, 3 `runtime-capability`; aucun contrat philosophique n'accorde la promotion. |
| Nosologie | 28 conditions, 9 familles | Catalogue et traitements bornés présents ; le parcours clinique complet reste conditionné par l'autorité et les preuves. |
| Outils backend déclarés | 185 | Registre de dispatch backend, distinct du catalogue public. |
| Définitions MCP partagées | 56 | Le fallback `mcp/toolDefinitions.json` en contient 51 ; l'exposition réelle reste `catalogue ∩ lease − outils désactivés`. |

Sources exécutables principales :
[`canonicalConceptInventory.js`](../../backend/src/services/ontogenesis/canonicalConceptInventory.js),
[`canonicalConceptRegistry.js`](../../backend/src/services/ontogenesis/canonicalConceptRegistry.js),
[`topologyCapabilityService.js`](../../backend/src/services/topologyCapabilityService.js),
[`dynamicOrganizationService.js`](../../backend/src/services/dynamicOrganizationService.js),
[`workerKindService.js`](../../backend/src/services/agents/workerKindService.js),
[`strategyRegistry.js`](../../backend/src/strategies/strategyRegistry.js),
[`conceptDefinitions.js`](../../backend/src/philosophy/conceptDefinitions.js) et
[`seedTools.js`](../../backend/src/db/seedTools.js).

## 3. Couverture des 23 sections

| # | Domaine de l'inventaire | État actuel et document canonique |
| ---: | --- | --- |
| 1 | Principes fondateurs | **Implémenté / Partiel** : snapshots, branches, budgets, leases, preuves et gates existent sur des surfaces bornées ; aucune gate unique ne couvre tout le produit. Voir [runtime agentique](runtime-agentique.md), [épistémologie et évidence](epistemologie-et-evidence.md) et [workspaces contrefactuels](../02-orchestration/workspaces-contrefactuel.md). |
| 2 | Biologie computationnelle | **Implémenté / Partiel / Métaphore** selon le terme. Les structures de cellule, génome, reproduction et régulation ont du code ; l'équivalence biologique n'est jamais revendiquée. Voir [biologie computationnelle](biologie-computationnelle.md), [continuité de mission](continuite-mission.md) et [écosystème agentique](ecosysteme-agentique.md). |
| 3 | AgentDNA et génome | **Implémenté sous contrats de format** : canonicalisation, empreinte, signature, sections binaires, opérations et migration existent ; la signature ne prouve pas la qualité du phénotype. Voir [AgentDNA](agent-dna-runtime.md), [génome et épigénétique](genome-et-epigenetique.md) et les spécifications [`AGENT_DNA_SPEC.md`](../../spec/AGENT_DNA_SPEC.md), [`GENOME_SPEC.md`](../../spec/GENOME_SPEC.md). |
| 4 | Épistémologie et évidence | **Implémenté / Partiel** : claims, hypothèses, provenance, scores, barrières et révision bornée existent ; vérité externe et indépendance ne sont pas inférées du transport. Voir [épistémologie et évidence](epistemologie-et-evidence.md) et [savoir et épistémologie](savoir-et-epistemologie.md). |
| 5 | Cognition, conscience et mental | **Fonctionnel / Conceptuel** : attention, calibration, dissonance et modèle de soi ont des indicateurs logiciels ; qualia et conscience phénoménale restent hors preuve. Voir [conscience, esprit et mental](conscience-esprit-mental.md) et [limites métrique/expérience](limites-metrique-experience.md). |
| 6 | Mémoire, apprentissage et plasticité | **Implémenté / Partiel** : mémoires épisodique, vectorielle, graphe et procédurale ont des services distincts ; consolidation, héritage et apprentissage collectif ne forment pas une mémoire unifiée garantie. Voir [mémoire et apprentissage](memoire-et-apprentissage.md) et [neurobiologie et plasticité](neurobiologie-et-plasticite.md). |
| 7 | Coordination et intelligence collective | **Implémenté / Partiel** : Signal Plane, messages, ACK, organisations et relations sont persistants sur des chemins bornés ; grounding et effet projet restent à prouver par mission. Voir [communication](../02-orchestration/communication.md), [relations](../02-orchestration/relations-inter-agents.md), [G-CIR](../02-orchestration/g-cir.md), [AGOW](../02-orchestration/agow.md) et [SHEV](../02-orchestration/shev.md). |
| 8 | Imagination, créativité et recherche | **Partiel** : NCE et Natural Search exécutent des expériences numériques bornées ; nouveauté, créativité émergente et généralisation ne disposent pas d'un oracle universel. Voir [Natural Creative Ecology](natural-creative-ecology.md) et [Natural Search](natural-search-control-plane.md). |
| 9 | Physique computationnelle | **Partiel** : métriques de coût, ressources hôte, seuils et blast radius sont calculables ; ce sont des modèles de contrôle, pas des lois physiques. Voir [physique computationnelle](physique-computationnelle.md). |
| 10 | Orchestration et exécution | **Implémenté / Partiel** : missions, runs, workflows, jobs, stratégies, retries, WAL, capsules, Git agentique et recovery existent sur plusieurs runtimes ; l'orchestration distribuée universelle n'est pas acquise. Voir [orchestration](../02-orchestration/orchestration.md), [workflows et jobs](../02-orchestration/workflows-et-jobs.md) et [contrats](../02-orchestration/contrats-strategie-et-execution.md). |
| 11 | Huit topologies | **Hétérogène** : les huit modes possèdent un contrat et un raccord ; leur niveau d'autonomie et de qualification diffère. Garage Fabric gère l'admission et la circulation, pas la composition. Voir [topologies et capacités](../02-orchestration/topologies-et-capacites.md) et [index des topologies](../02-orchestration/topologies/README.md). |
| 12 | Organisations dynamiques | **20 côté Node, 19 côté Rust**. `cross_functional_pod` est le vingtième profil Node ; il n'est pas encore dans le tableau Rust `ORGANIZATIONS`. Les pas sont locaux et bornés, pas une boucle collective autonome. |
| 13 | Capacités topologiques | **Contrat déclaratif de 51 capacités**. Les 37 entrées historiques sont complétées par 14 capacités procédurales, causales et mémorielles : `PROCEDURAL_MEMORY`, `PROCEDURAL_GUIDANCE`, `PROCEDURAL_EVOLUTION`, `PROCEDURAL_CAUSAL_VALIDATION`, `CAUSAL_STATE`, `SEMANTIC_CONFLICTS`, `INVARIANT_GATES`, `SELECTIVE_SYNC`, `TRANSACTIONAL_SHARED_STATE`, `WORKING_MEMORY`, `ANCESTRAL_MEMORY`, `RISK_INHERITANCE`, `COLLECTIVE_PLASTICITY`, `TEACHING_WORKER`. Voir [topologies et capacités](../02-orchestration/topologies-et-capacites.md). |
| 14 | Types de workers | **19 contrats de kind**. Famille, autorité, budget et artefact sont opposables ; l'incarnation et l'exécution native dépendent du dispatcher et des leases. Voir [types de workers](../03-reference/types-de-workers.md). |
| 15 | Cycle universel d'un worker | **Contrat / Partiel** : les étapes sont représentées dans les cycles Rust et Node, mais aucun worker n'exécute obligatoirement chaque étape comme une machine universelle unique. Voir [protocole d'exécution](../02-orchestration/protocole-execution-agents.md). |
| 16 | Biomimétisme spécialisé | **Partiel** : foraging, fovéation et primitives sensorielles ont des calculs ou handlers ; l'acquisition réelle et la boucle capture → décision → action → vérification ne sont pas universellement raccordées. Voir [biomimétisme](biomimetisme/README.md). |
| 17 | AEIS | **Implémenté sur un périmètre borné / Partiel globalement** : antigènes, sélection, mémoire, reçus et ré-arbitrage existent ; l'oracle scellé et la revue multi-fournisseur restent dépendants de preuves et fournisseurs effectifs. Voir [AEIS](adaptive-epistemic-immune-system.md). |
| 18 | Nosologie computationnelle | **28 conditions dans 9 familles**. Le catalogue, les marqueurs et plusieurs thérapies sont exécutables ; aucune métaphore clinique ne doit masquer une panne logicielle ordinaire. Voir [nosologie](nosologie/README.md). |
| 19 | Mondes possibles et philosophie | **420 concepts enregistrés** avec audits logiciels bornés. Les analyses restent descriptives ou interprétatives ; même les 3 `runtime-capability` n'accordent ni autorité ni promotion. Voir [registre philosophique](../03-reference/registre-philosophique.md) et [matrice des 420 concepts](../03-reference/matrice-operationnelle-philosophique.md). |
| 20 | Interfaces et surfaces techniques | **Implémenté / Partiel** : REST, gRPC, MCP stdio, CLI et persistance existent ; Studio, TUI, IDE et providers ont des couvertures variables. Voir [API et contrats](../03-reference/api-et-contrats.md), [outils MCP](../03-reference/outils-mcp.md) et [modèles/providers](../03-reference/modeles-providers-routage.md). |
| 21 | Sécurité, autorité et gouvernance | **Implémenté / Partiel** : identité, scopes, approbations, confinement et audit ont des contrôles dédiés ; VFS/worktree ne constituent pas un confinement universel de code hostile et aucune certification de compliance n'est déduite. Voir [sécurité et gouvernance](../05-securite-gouvernance/README.md). |
| 22 | Exploitation et résilience | **Implémenté / Partiel** : heartbeat, retry, dead-letter, WAL, rollback, restauration et rollout existent sur des parcours bornés ; haute disponibilité et reprise transparente de tout contexte restent hors preuve. Voir [exploitation](../04-exploitation/README.md) et [résilience](../04-exploitation/resilience-et-reprise.md). |
| 23 | Chaîne centrale | **Invariant d'architecture, pas pipeline unique** : mission → différenciation → contrat → lease → exécution isolée → observation → action bornée → reçus → preuve → falsification → décision → promotion, rejet, récupération ou fossilisation. Chaque transition conserve sa propre autorité et ses preuves. |

## 4. Matrices exhaustives et portée temporelle

Chaque terme de l'inventaire initial est évalué dans les matrices suivantes :

- [sections 1 à 7](../06-qualite-preuves/audit-concepts-01-07.md) ;
- [sections 8 à 15](../06-qualite-preuves/audit-concepts-08-15.md) ;
- [sections 16 à 19](../06-qualite-preuves/audit-concepts-16-19.md) ;
- [sections 20 à 23](../06-qualite-preuves/audit-concepts-20-23.md).

Ces rapports conservent les résultats et limites du checkout où leurs contrôles
ont été exécutés. Ils ne sont pas réécrits rétroactivement quand le registre
évolue. Cette page et les registres exécutables donnent les comptes courants ;
les rapports donnent les preuves datées. Les deltas postérieurs à leur baseline
sont les 20 organisations, les 51 capacités et les 420 concepts philosophiques
décrits ci-dessus.

## 5. Processus de mise à jour

1. Modifier d'abord le registre exécutable responsable du concept.
2. Mettre à jour le document canonique et cette synthèse sans effacer les
   résultats historiques.
3. Vérifier les comptes par chargement des modules, puis exécuter les suites
   ciblées du registre concerné.
4. Garder séparés disponibilité, autorité, exécution, preuve indépendante et
   promotion.
5. Ne jamais convertir un alias, une description ou un test non exécuté en
   capacité déclarée « complète ».

## 6. Limites et non-objectifs

- Les 711 entrées sont des références demandables, pas 711 outils ni 711 services.
- Les comptes de registres ne prouvent pas la parité Node/Rust ou la couverture
  de toutes les interfaces.
- `ready`, `implemented` et `runtime-capability` ont une portée locale à leur
  registre ; aucun de ces mots ne certifie une vérité externe.
- Cette synthèse ne promeut aucun concept et n'élargit aucune permission, lease
  ou politique de sécurité.
