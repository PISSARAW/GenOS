## Équité linguistique, tokenisation et données synthétiques

Le problème des langues peu dotées est particulièrement important pour les agents, parce que les inégalités ne concernent pas seulement la qualité linguistique : elles affectent aussi **coût, vitesse, mémoire disponible et performance de raisonnement**.

Une étude sur les tokenizers multilingues a constaté que des traductions du même contenu pouvaient présenter jusqu’à environ **15× de différence en nombre de tokens** entre certaines langues. Cela signifie qu’un utilisateur peut payer davantage et disposer d’une fenêtre de contexte effective plus faible uniquement en raison de sa langue. citeturn6search1

Il faut donc nuancer l’exemple « un mot bambara ou lingala vaut systématiquement 10–15 tokens » : ce n’est pas une règle universelle mot par mot. En revanche, **l’existence de disparités massives de fertilité de tokenisation entre langues est bien documentée**. citeturn6search1

Le problème vient notamment de la manière dont le vocabulaire du tokenizer est appris. Les motifs fréquents dans les données d’entraînement obtiennent généralement des représentations plus compactes ; les langues, scripts ou formes morphologiques moins représentés sont plus souvent fragmentés en sous-unités.

Pour un agent multilingue, les effets s’accumulent :

```text
plus de tokens
    ↓
plus de coût
    ↓
moins de documents dans le contexte
    ↓
latence supérieure
    ↓
séquences effectives plus longues
    ↓
raisonnement potentiellement plus difficile
```

Les initiatives telles que NLLB ont montré l’importance d’investir explicitement dans les langues peu dotées ; NLLB-200 visait la traduction automatique à grande échelle sur 200 langues et le rapprochement des performances entre langues riches et pauvres en ressources. citeturn6search2turn6search23

Masakhane souligne par ailleurs plusieurs difficultés persistantes pour le NLP africain, notamment le manque de ressources, la faible découvrabilité des données et les défis de benchmarking reproductible. citeturn6search3

### Comment construire un agent réellement multilingue

Il ne suffit donc pas de mettre :

```text
"You speak all languages"
```

dans le system prompt.

Il faut instrumenter le système.

À l’arrivée de chaque requête :

```text
language detector
      │
      ▼
tokenization audit
      │
      ├─ langue bien couverte
      │       ↓
      │   pipeline standard
      │
      └─ langue peu dotée
              ↓
       embeddings adaptés
              ↓
       corpus local / régional
              ↓
       budget de contexte adapté
              ↓
       éventuellement traduction pivot
              ↓
       validation par modèle/langue spécialisée
```

Un benchmark interne devrait mesurer, **par langue** :

| Métrique | Pourquoi |
|---|---|
| tokens / phrase | coût linguistique |
| latency | disparité opérationnelle |
| retrieval recall | qualité du RAG |
| tool selection accuracy | capacité agentique |
| factuality | fiabilité |
| task completion | résultat réel |
| code-switch handling | usage réel |
| coût par tâche réussie | équité économique |

C’est cette dernière métrique qui est souvent oubliée. Deux langues peuvent obtenir 80 % de précision, mais si l’une exige trois fois plus de tokens et deux fois plus d’appels de modèles, elles ne bénéficient pas du même service.

### Le « data wall » est une contrainte probable, pas un mur déjà atteint

L’idée selon laquelle « les modèles ont déjà lu tout Internet de qualité » est trop catégorique. Des chercheurs d’Epoch AI ont plutôt projeté qu’en extrapolant les tendances de croissance des datasets, les stocks de texte humain public pourraient devenir limitants entre environ 2026 et 2032. C’est un scénario de contraintes croissantes, non la preuve que toute donnée humaine utile a déjà été consommée. citeturn10search0turn10search3

Les scaling laws de Chinchilla avaient déjà souligné que l’amélioration des modèles ne dépend pas seulement du nombre de paramètres : augmenter correctement la quantité de données d’entraînement est également essentiel. citeturn10search1

Cela explique l’intérêt grandissant pour les données synthétiques.

Pour un agent, les données synthétiques sont particulièrement intéressantes parce qu’on peut générer non seulement du texte mais des **trajectoires complètes** :

```text
user request
→ plan
→ tool call
→ observation
→ correction
→ second tool
→ verification
→ final answer
```

On peut alors entraîner un petit agent sur des millions de simulations.

La méthode robuste n’est toutefois pas :

```text
LLM
 ↓
synthetic data
 ↓
same LLM family
 ↓
synthetic data
 ↓
same process forever
```

Les travaux publiés dans Nature sur le « model collapse » montrent le danger d’un entraînement récursif indiscriminé sur des données générées : les distributions peuvent progressivement perdre des informations, notamment sur leurs queues, lorsque les générations remplacent les données originales. citeturn9search0turn9search1

La situation est plus nuancée que « données synthétiques = collapse ». Des travaux plus récents étudient justement les conditions dans lesquelles le mélange de données humaines et synthétiques, la qualité des générations et la sélection des exemples évitent ces phénomènes ; le risque dépend de la composition et du protocole de génération, pas simplement de la présence de données synthétiques. citeturn9search2

La recette recommandée est plutôt :

```text
               Human / real data
                      │
                      ▼
Teacher model → Synthetic candidates
                      │
                      ▼
             Programmatic verifier
             / tests / simulator
                      │
                      ▼
                Quality filter
                      │
                      ▼
       Human gold + real + synthetic
                      │
                      ▼
                Student model
                      │
                      ▼
                Eval on REAL data
```

Pour le code, on peut compiler et exécuter les tests. Pour les mathématiques, utiliser un solveur ou recalculer la réponse. Pour le RAG, vérifier que la réponse est supportée par les passages. Pour un agent d’API, exécuter les trajectoires dans un sandbox ou simulateur.

Le grand avantage des agents est précisément qu’ils offrent parfois un **signal de vérité exécutable** que le texte pur ne possède pas.


## Architecture recommandée pour appliquer les dix domaines à un agent

En combinant les résultats précédents, je recommanderais une architecture en sept couches plutôt qu’un « gros agent autonome ».

```text
┌───────────────────────────────────────────────────────────────┐
│                     INTERFACE UTILISATEUR                     │
└─────────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│ INTENT / RISK ROUTER                                          │
│ langue • complexité • fraîcheur • impact • permissions        │
└─────────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│ ORCHESTRATEUR                                                 │
│ état explicite • plan • budget • timeout • max steps          │
└─────────┬───────────────────┬───────────────────┬─────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
┌────────────────┐   ┌──────────────────┐  ┌───────────────────┐
│ MEMORY / RAG   │   │ TOOL GATEWAY     │  │ SPECIALISTS       │
│ vector         │   │ JSON schemas     │  │ SLM / code / etc. │
│ graph          │   │ permissions      │  │ multi-agent only  │
│ SQL            │   │ sandbox          │  │ when justified    │
└───────┬────────┘   └─────────┬────────┘  └────────┬──────────┘
        │                      │                    │
        └──────────────────────┼────────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────────┐
│ VERIFICATION                                                  │
│ citations • business rules • tests • cross-check • freshness  │
└─────────────────────────────┬─────────────────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
              LOW RISK                HIGH IMPACT
                  │                       │
                  │                 Human approval
                  │                       │
                  └───────────┬───────────┘
                              ▼
┌───────────────────────────────────────────────────────────────┐
│ EXECUTION + AUDIT                                             │
│ logs • provenance • cost • traces • feedback • evaluations    │
└───────────────────────────────────────────────────────────────┘
```

Cette architecture est cohérente avec le passage observé dans les frameworks modernes vers des workflows possédant état, middleware, observabilité et orchestration explicite, plutôt que de longues conversations multi-agents non contraintes. Microsoft Agent Framework met ainsi en avant gestion d’état, type safety, middleware, télémétrie et workflows graphes, tandis que CrewAI distingue également Flows structurés et Crews d’agents. citeturn14search0turn14search6turn15search20

Voici comment les dix thèmes se traduisent concrètement dans cette architecture :

| Domaine de recherche | Application dans l’agent | Priorité production |
|---|---|---|
| RAG / GraphRAG | mémoire sémantique et preuves externes | **Critique** |
| Self-reflection / CoT | génération de candidats, critique, planification | Haute, mais jamais comme preuve unique |
| Long context | état temporaire, gros documents, codebases | Haute |
| KV / context caching | réduction coût-latence sur préfixes répétés | Haute |
| Function calling | interface structurée avec le monde réel | **Critique** |
| ReAct | boucle observation-action | **Critique** |
| Multi-agent | parallélisation ou spécialisation réelle | Conditionnelle |
| Quantization / SLM | routage, tâches simples, local/on-device | Très haute |
| LoRA / QLoRA | spécialisation comportementale | Conditionnelle |
| Distillation | transférer les tâches récurrentes vers SLM | Très haute à grande échelle |
| RLHF / Constitution | comportement de base du modèle | Haute |
| Runtime guardrails | permissions et sécurité réelles | **Critique** |
| Test-time compute | budget adaptatif de raisonnement | Très haute |
| NLP low-resource | équité de coût et de capacité | Haute si international |
| Mamba / SSM | efficacité longue séquence / streaming | À surveiller / cas spécialisés |
| Red teaming | test de prompt injection et permissions | **Critique** |
| Synthetic data | entraînement d’actions et trajectoires | Très haute avec vérification |
| Anti-collapse | maintien d’un corpus réel/gold | **Critique** pour training continu |

Le principe le plus important est d’avoir **plusieurs lignes de défense indépendantes**. Un agent ne devrait pas être considéré fiable parce qu’il possède « le bon prompt ». Il devrait rester raisonnablement sûr lorsqu’un mécanisme échoue : mauvais retrieval, mauvaise planification, hallucination, injection malveillante, outil défaillant ou modèle compromis. Cette vision en défense multicouche est cohérente avec les recommandations de gestion du risque NIST et les approches de sécurité agentique qui reconnaissent qu’une protection purement au niveau modèle ne peut pas être parfaite. citeturn15search14turn15search15


## Feuille de route de construction et système d’évaluation

Pour transformer ces recherches en produit, je ne commencerais pas par un framework multi-agent. Je commencerais par un **agent unique, instrumenté et vérifiable**, puis n’ajouterais de sophistication que lorsqu’un benchmark démontre son bénéfice. Les résultats récents sur le scaling multi-agent montrent précisément que davantage de coordination n’entraîne pas mécaniquement davantage de performance. citeturn16search0turn16search4

La première version devrait avoir cette chaîne :

```text
LLM
+ typed tools
+ RAG
+ citations
+ state machine
+ logging
+ max-step budget
+ verifier
+ human approval for writes
```

Ensuite seulement :

```text
+ model router
+ SLM
+ caching
+ semantic/episodic memory
+ Knowledge Graph
```

Puis, lorsque les mesures le justifient :

```text
+ adaptive test-time compute
+ specialist agents
+ parallel execution
+ distilled models
+ LoRA
```

Et en continu :

```text
+ red team
+ prompt injection tests
+ poisoning tests
+ multilingual eval
+ synthetic trajectory generation
+ regression suite
```

Le système d’évaluation est au moins aussi important que l’architecture. Pour un agent, mesurer uniquement « la qualité de la réponse finale » masque souvent les pannes intermédiaires.

Je construirais un tableau de bord comportant au minimum :

| Dimension | Métrique |
|---|---|
| Factualité | claim precision / citation correctness |
| Retrieval | Recall@K, precision@K, source authority |
| Abstention | taux d’erreurs acceptées vs refus justifiés |
| Outils | tool-selection accuracy |
| Arguments | schema/argument validity |
| Planning | task completion rate |
| Raisonnement | succès avec budget fixe |
| Sécurité | prompt-injection attack success rate |
| Permissions | unauthorized-action rate |
| Robustesse | recovery after tool failure |
| Mémoire | stale-memory / contradiction rate |
| Langues | task success par langue |
| Équité | coût/token par langue |
| Latence | p50 / p95 |
| Coût | coût par tâche réussie |
| Autonomie | actions par tâche |
| Efficacité | tokens par tâche réussie |
| Production | incidents / 1 000 tâches |

L’indicateur synthétique le plus intéressant n’est probablement pas :

> **« Combien de tâches l’agent termine-t-il ? »**

mais :

> **« Combien de tâches termine-t-il correctement, avec des preuves suffisantes, sans action non autorisée, sous une limite donnée de coût et de latence ? »**

Cela permet d’éviter l’illusion d’un agent « plus performant » simplement parce qu’on lui donne plus de tokens, plus d’outils, plus de temps et plus d’agents.

On peut formaliser l’objectif d’optimisation comme :

\[
\text{Utility} =
P(\text{succès vérifié})
-\lambda_1 C_{\text{compute}}
-\lambda_2 C_{\text{latence}}
-\lambda_3 P(\text{action dangereuse})
-\lambda_4 P(\text{hallucination})
\]

L’agent réellement avancé n’est ainsi pas celui qui **raisonne le plus longtemps**, mais celui qui sait **quand récupérer, quand raisonner, quand agir, quand vérifier et quand s’arrêter**.

La combinaison des dix domaines conduit finalement à une vision assez claire de l’évolution technologique :

```text
             ANCIEN PARADIGME

Prompt → Grand LLM → Réponse


             PARADIGME AGENTIQUE

                  ┌── mémoire externe
                  ├── RAG / graph
                  ├── outils/API
                  ├── modèles spécialisés
                  ├── données temps réel
Utilisateur → Orchestrateur
                  ├── reasoning adaptatif
                  ├── vérificateurs
                  ├── guardrails
                  ├── permissions
                  └── mémoire / feedback
                           ↓
                    Action vérifiée
```

Le résultat le plus important de cette recherche est donc que les prochaines avancées en agents ne dépendront probablement pas d’une seule innovation spectaculaire. Elles viendront de la **composition** de plusieurs idées : RAG pour la connaissance mutable ; long context et caching pour la continuité ; ReAct et function calling pour l’action ; test-time compute pour les problèmes difficiles ; SLM, quantification et distillation pour l’économie ; graphes et validateurs pour la vérification ; guardrails externes pour les permissions ; red teaming pour la résilience ; pipelines multilingues pour l’équité ; et données synthétiques vérifiées pour améliorer continuellement les modèles. Les travaux sur RAG, ReAct, test-time scaling, systèmes multi-agents, sécurité et données synthétiques convergent tous vers ce déplacement du centre de gravité : **la qualité d’un agent dépend de plus en plus de l’architecture du système autour du modèle, et non seulement du modèle lui-même**. citeturn0search0turn2search0turn5search0turn16search4turn15search9turn9search0
