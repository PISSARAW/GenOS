# Recherche approfondie : construire des agents IA fiables, économes, sécurisés et réellement agentiques

## Synthèse stratégique

Les dix thèmes proposés décrivent assez bien les principaux fronts de recherche qui transforment actuellement les LLM en **systèmes agentiques utilisables en production**. La conclusion la plus importante de cette recherche est toutefois qu’un agent fiable ne se construit pas en maximisant une seule capacité — une fenêtre de contexte gigantesque, davantage de raisonnement, davantage d’agents ou un meilleur modèle — mais en **séparant explicitement cognition probabiliste, mémoire, récupération de faits, permissions, exécution et vérification**. Le RAG original de Lewis et al. illustre déjà cette séparation entre mémoire paramétrique du modèle et mémoire non paramétrique récupérée à la demande ; les systèmes GraphRAG, ReAct et Self-RAG étendent ensuite cette idée vers des boucles beaucoup plus structurées de récupération, action et critique. citeturn0search0turn0search1turn0search2turn2search0

Une architecture moderne devrait donc considérer le LLM comme **un moteur de décision faillible**, et non comme le système d’enregistrement de la vérité. Les données d’entreprise, les bases transactionnelles, les graphes de connaissances, les API, les documents et les résultats d’outils constituent les sources d’autorité ; le LLM décide comment les consulter, comment combiner les résultats et comment présenter la réponse. Cette distinction devient encore plus importante lorsque l’agent possède des droits d’écriture, car une hallucination qui reste dans une réponse textuelle est un problème de qualité, alors qu’une hallucination reliée à une API bancaire, un CRM, un terminal ou une messagerie devient un problème de sécurité. Les travaux sur les injections indirectes et les recommandations OWASP montrent précisément pourquoi l’autonomie augmente la surface d’attaque. citeturn8search0turn15search9turn15search35

Il faut également corriger plusieurs simplifications fréquentes :

| Affirmation courante | Ce que montre la recherche | Conséquence pour un agent |
|---|---|---|
| « Le RAG supprime les hallucinations » | Il fournit des informations externes pertinentes, mais une récupération erronée, incomplète ou empoisonnée peut toujours produire une réponse fausse. citeturn0search0turn8search2 | Ajouter provenance, score de confiance, validation des sources et possibilité d’abstention. |
| « Faire écrire le Chain-of-Thought rend le modèle fiable » | Le CoT améliore certaines tâches de raisonnement, mais le raisonnement affiché n’est pas nécessairement une explication fidèle de la véritable cause de la réponse. citeturn0search3turn13search0turn13search3 | Utiliser des preuves vérifiables et des validateurs plutôt qu’un long monologue de raisonnement. |
| « Un million de tokens remplace le RAG » | Les fenêtres million-token existent, mais la récupération au sein d’un contexte très long n’est pas parfaite et se dégrade notamment quand plusieurs informations doivent être retrouvées. citeturn11search11turn15search29 | Garder une mémoire hiérarchique et récupérer uniquement ce qui est pertinent. |
| « Function calling signifie que le modèle sait quand il ne sait pas » | Le modèle produit un appel structuré correspondant aux outils qui lui ont été décrits ; l’application reste responsable de l’exécution et de la validation. citeturn2search3turn2search7 | Les outils doivent être typés, limités et contrôlés hors du LLM. |
| « Plus d’agents = meilleur résultat » | Des travaux récents montrent de forts gains sur certaines tâches parallélisables, mais aussi des dégradations importantes sur des tâches séquentielles. citeturn16search0turn16search4 | Commencer avec un agent ; ajouter des agents uniquement lorsqu’il existe une vraie décomposition du travail. |
| « Mamba permet un contexte réellement infini » | Les SSM ont une complexité séquentielle favorable, mais leur état compressé impose des limites de rappel ; des architectures hybrides réintroduisent justement de l’attention. citeturn7search0turn7search2turn7search3 | Les SSM sont un outil d’efficacité, pas une mémoire infinie. |
| « Internet de qualité est déjà entièrement épuisé » | Il s’agit plutôt d’une contrainte anticipée : Epoch estime que, si les tendances se prolongent, la quantité de données publiques humaines pourrait devenir limitante autour de 2026–2032. citeturn10search0turn10search3 | Investir dans données privées de qualité, données synthétiques vérifiées et environnements interactifs. |

La meilleure architecture qui ressort de l’ensemble de ces recherches ressemble donc moins à un « chatbot très intelligent » qu’à un petit système distribué :

```text
Utilisateur
    │
    ▼
┌─────────────────────────┐
│ Intent + Risk Router    │
└────────────┬────────────┘
             │
      ┌──────▼──────┐
      │   Planner   │
      └──────┬──────┘
             │
 ┌───────────┼──────────────────────┐
 │           │                      │
 ▼           ▼                      ▼
RAG       Knowledge             Outils / API
          Graph                 typés
 │           │                      │
 └───────────┴──────────┬───────────┘
                        ▼
                ┌──────────────┐
                │  Executor    │
                └──────┬───────┘
                       ▼
             ┌────────────────────┐
             │ Verifier / Critic  │
             │ Policy / Security  │
             └─────────┬──────────┘
                       ▼
          Validation / abstention / réponse
                       │
                       ▼
            Mémoire + traces + évaluations
```

Le point essentiel est que **le chemin vers l’action doit être plus contraint que le chemin vers la réflexion**. Un modèle peut proposer librement dix hypothèses ; il ne devrait pas pouvoir librement déclencher dix paiements, supprimer dix fichiers ou envoyer dix courriels. OWASP recommande précisément de déplacer les contrôles stricts hors du prompt lorsque cela est possible, car un system prompt seul ne constitue pas une frontière de sécurité. citeturn15search21turn15search5


## Fiabilité, hallucinations, mémoire et contexte

Le premier problème à résoudre est celui de l’**ancrage épistémique** : comment obliger un agent à distinguer ce qu’il sait grâce à une source, ce qu’il infère et ce qu’il ignore.

Le RAG reste l’une des briques fondamentales. Dans son formulation originale, il combine les paramètres du modèle avec un index documentaire externe récupéré à la demande ; l’objectif était précisément de mieux traiter les tâches nécessitant des connaissances tout en permettant une forme de provenance et une mise à jour des connaissances sans réentraîner entièrement le modèle. citeturn0search0

Pour un agent, il faut cependant penser au-delà du pipeline simpliste :

```text
question
   ↓
embedding
   ↓
top-k documents
   ↓
LLM
   ↓
réponse
```

Un RAG agentique beaucoup plus robuste effectue plutôt :

```text
Question
   ↓
Décomposition en sous-questions
   ↓
Choix de la source appropriée
   ├── base vectorielle
   ├── recherche lexicale
   ├── Knowledge Graph
   ├── SQL
   ├── API temps réel
   └── Web
   ↓
Retrieval
   ↓
Reranking
   ↓
Contrôle de pertinence / fraîcheur / autorité
   ↓
Réponse provisoire
   ↓
Vérification de chaque affirmation importante
   ↓
Réponse + provenance
   ou
"preuves insuffisantes"
```

Cette idée rejoint Self-RAG, qui ne se contente pas de récupérer systématiquement des documents : le modèle apprend à décider quand récupérer des informations et à critiquer sa propre génération et les éléments récupérés. Cela illustre une évolution importante : **RAG devient une politique de décision**, plutôt qu’une simple recherche vectorielle effectuée avant chaque prompt. citeturn0search1turn0search9

Les Knowledge Graphs remplissent une autre fonction. GraphRAG construit notamment des entités, relations, communautés et résumés hiérarchiques à partir d’un corpus, permettant des requêtes qui demandent une vision globale de relations dispersées dans de nombreux documents. Le graphe ne doit toutefois pas être présenté comme une « machine automatique à vérifier la vérité » : sa valeur dépend de la qualité des entités et relations qui y ont été introduites. Son avantage principal est de rendre certaines relations explicites et interrogeables. citeturn0search2turn0search6turn0search10

Pour un agent d’entreprise, on peut ainsi séparer quatre formes de mémoire :

| Mémoire | Exemple | Durée | Utilisation |
|---|---|---:|---|
| Working memory | objectif, plan actuel, résultats des trois derniers outils | secondes/minutes | boucle de raisonnement |
| Mémoire épisodique | « le client a rejeté cette proposition mardi » | jours/mois | continuité entre sessions |
| Mémoire sémantique | documentation, procédures, contrats | longue | RAG / Knowledge Graph |
| Source of truth | CRM, ERP, base SQL, système bancaire | durable et transactionnelle | vérification et actions |

Cette séparation évite un antipattern majeur : **réinjecter toute l’histoire de l’agent à chaque tour**. Même avec des fenêtres million-token, les résultats de récupération dans un contexte très long ne sont pas parfaits ; la documentation de Gemini souligne notamment que les performances sont plus faibles lorsqu’il faut retrouver plusieurs « needles » qu’un seul élément. citeturn11search11

### Ce que permettent réellement Ring Attention, RoPE et les grands contextes

RoPE — Rotary Position Embedding — encode les positions par rotations et permet de représenter naturellement des dépendances relatives entre positions ; c’est une composante essentielle de nombreux modèles modernes, mais elle n’explique pas à elle seule l’arrivée des contextes million-token. citeturn1search1

Ring Attention est d’une autre nature : il distribue les calculs d’attention en faisant circuler les blocs de clés et valeurs entre appareils, ce qui permet d’exploiter la mémoire agrégée de plusieurs accélérateurs. Les auteurs ont démontré plus d’un million de tokens pour un modèle 7B sur 32 A100 et des séquences d’entraînement dépassant 30 millions de tokens sur un grand cluster TPU dans leurs expériences. Ce sont des démonstrations de passage à l’échelle distribué, pas la garantie qu’un modèle se souviendra parfaitement de tout élément présent dans 30 millions de tokens. citeturn1search0

C’est une distinction essentielle :

**capacité de faire entrer N tokens ≠ capacité de raisonner parfaitement sur N tokens.**

Pour un agent, la règle devrait donc être :

> **Long context pour conserver de la continuité ; retrieval pour sélectionner ; mémoire structurée pour persister.**

### KV cache et context caching

Pendant la génération autorégressive, le modèle calcule des représentations « key » et « value » pour les tokens antérieurs. Le KV cache permet de conserver ces résultats au lieu de recalculer toute la séquence à chaque nouveau token. Les travaux autour de PagedAttention/vLLM visent notamment à gérer cette mémoire plus efficacement et à limiter son gaspillage. citeturn1search3turn1search26

Le **prompt/context caching offert par les fournisseurs** est lié conceptuellement mais se situe à un niveau différent : il permet de réutiliser des préfixes déjà calculés entre plusieurs requêtes. Anthropic décrit par exemple la mise en cache de préfixes de prompt, tandis que Google propose de la mise en cache implicite ou explicite de contexte. citeturn11search0turn11search1

C’est particulièrement utile pour un agent qui traite :

```text
Manuel technique de 300 000 tokens
+ instructions système
+ schémas de 50 outils
+ politiques internes
+ question utilisateur A
```

puis :

```text
Même manuel
+ mêmes instructions
+ mêmes outils
+ mêmes politiques
+ question utilisateur B
```

L’optimisation correcte consiste à placer le contenu **stable en tête du contexte**, mettre en cache cette partie et ne faire varier que la portion dynamique.

Mais une architecture encore plus économique évite souvent d’envoyer les 300 000 tokens : elle indexe le manuel, sélectionne quelques passages pertinents et conserve les éléments déjà utilisés dans une mémoire de travail compacte.

### Self-reflection et Chain-of-Thought : attention au faux sentiment de sécurité

Le Chain-of-Thought a montré qu’il pouvait nettement améliorer les performances de grands modèles sur des tâches arithmétiques, symboliques ou de raisonnement. citeturn0search3

En revanche, **un raisonnement verbal plausible n’est pas une preuve de fiabilité**. Des études ont montré que les explications CoT peuvent parfois rationaliser après coup une réponse influencée par des facteurs que le raisonnement affiché ne reconnaît pas, et que leur fidélité varie selon les modèles et les tâches. citeturn13search0turn13search3

Pour un agent de production, la bonne stratégie n’est donc pas :

> « Écris 3 000 tokens de raisonnement avant de répondre. »

Elle est plutôt :

> « Collecte des preuves ; génère une proposition ; vérifie-la par une procédure indépendante ; refuse si les preuves sont insuffisantes. »

Autrement dit, remplacer autant que possible **l’introspection invérifiable par la vérification externe**.

Une excellente primitive d’agent est alors un objet de résultat tel que :

```json
{
  "answer": "...",
  "claims": [
    {
      "claim": "...",
      "evidence_ids": ["doc_17", "api_4"],
      "confidence": 0.93
    }
  ],
  "unsupported_claims": [],
  "freshness": "2026-08-21",
  "abstain": false
}
```

Le modèle peut encore se tromper sur son propre score de confiance ; l’intérêt principal est que l’architecture rend désormais les affirmations **auditables**.


## De l’appel d’outils au véritable système agentique

L’évolution la plus importante ne vient peut-être pas de modèles plus grands, mais du fait qu’un LLM peut maintenant devenir le contrôleur d’une boucle logicielle.

Avec le function/tool calling, le modèle reçoit la description d’une fonction et un schéma — souvent JSON — et produit un appel structuré correspondant. L’application exécute ensuite réellement l’action et renvoie le résultat au modèle. Cela permet de relier un LLM à des bases de données, moteurs de recherche, calendriers, logiciels métier ou environnements de calcul sans demander au modèle de « simuler » leurs résultats. citeturn2search3turn2search7

Le pattern essentiel devient :

```text
OBSERVE
   ↓
REASON / PLAN
   ↓
SELECT TOOL
   ↓
CALL
   ↓
VALIDATE RESULT
   ↓
UPDATE STATE
   ↓
REPEAT or STOP
```

C’est très proche de ReAct, qui intercale explicitement raisonnement et actions permettant d’acquérir de nouvelles informations. Le papier ReAct montre notamment l’intérêt de cette interaction avec des sources externes plutôt que de demander au modèle de résoudre entièrement le problème depuis sa mémoire paramétrique. citeturn2search0turn2academia37

La véritable innovation de ReAct est presque architecturale : **le modèle n’a plus besoin de tout savoir avant de commencer**. Il peut découvrir l’état du monde au fur et à mesure.

Pour un agent commercial, par exemple :

```text
Objectif :
"Prépare-moi une proposition commerciale pour ACME."

Agent :
→ rechercher ACME dans le CRM
→ récupérer les opportunités ouvertes
→ récupérer les anciens échanges
→ consulter la grille tarifaire actuelle
→ identifier les produits compatibles
→ calculer la proposition
→ vérifier les remises autorisées
→ rédiger le document
→ demander validation humaine
→ envoyer uniquement après autorisation
```

C’est beaucoup plus robuste que de demander :

```text
"Réfléchis et écris une proposition pour ACME."
```

car presque chaque élément important est désormais relié à une source ou une opération vérifiable.

### Le test-time compute devient le budget cognitif de l’agent

Les travaux récents sur le test-time scaling montrent qu’il existe un nouvel axe de mise à l’échelle : augmenter le calcul **au moment de résoudre un problème**, plutôt que seulement pendant le pré-entraînement. Les stratégies étudiées incluent l’échantillonnage de plusieurs solutions, l’utilisation de modèles vérificateurs, la recherche adaptative et l’augmentation ou limitation dynamique du budget de raisonnement. citeturn5search0

Les travaux s1 montrent par exemple qu’une méthode de « budget forcing » permettant de prolonger ou limiter le raisonnement peut modifier sensiblement les performances, tandis que DeepSeek-R1 a montré qu’un entraînement par renforcement pouvait faire émerger des comportements de vérification, réflexion et adaptation de stratégie. citeturn5search1turn5search2turn5search6

Cela suggère une propriété très importante pour les agents : **le compute devrait être adaptatif**.

Une classification d’email peut nécessiter :

```text
1 appel SLM
0 outil
0 vérificateur complexe
```

Une analyse fiscale peut nécessiter :

```text
modèle de raisonnement
+ RAG juridique
+ recherche de textes actuels
+ calcul
+ vérificateur
+ second passage critique
+ approbation humaine
```

Il serait économiquement absurde d’utiliser le second pipeline pour chaque requête.

Un bon « reasoning router » peut donc attribuer un budget :

| Classe | Exemple | Budget |
|---|---|---|
| Simple | classifier un ticket | faible |
| Factuel | retrouver une politique interne | faible + RAG |
| Analytique | comparer cinq offres | moyen + outils |
| Raisonnement | problème complexe de code/math | élevé + vérification |
| Fort impact | paiement, juridique, santé, production | élevé + vérification + humain |

Les travaux sur la supervision de processus renforcent également l’idée qu’il est utile d’évaluer des étapes intermédiaires plutôt que seulement la réponse finale dans certains problèmes de raisonnement. citeturn5search3

### Multi-agents : extrêmement utiles, mais seulement au bon endroit

AutoGen et CrewAI ont popularisé la construction de systèmes où plusieurs agents ont des rôles distincts. CrewAI expose aujourd’hui des notions d’agents, crews et flows avec mémoire, guardrails et observabilité ; ses « Flows » servent notamment à imposer une orchestration structurée autour des agents. citeturn15search0turn15search20

Il faut toutefois actualiser l’exemple AutoGen : **en août 2026, AutoGen est en mode maintenance**, Microsoft recommandant aux nouveaux projets d’utiliser Microsoft Agent Framework, présenté comme son successeur direct et réunissant des abstractions issues d’AutoGen et Semantic Kernel. Microsoft Agent Framework 1.0 a été annoncé en avril 2026. citeturn14search0turn14search1turn14search3turn14search14

La tendance moderne n’est donc plus simplement :

```text
Agent A parle à Agent B
Agent B parle à Agent C
jusqu'à ce qu'ils soient d'accord.
```

Elle va davantage vers :

```text
Workflow déterministe
    │
    ├─ Agent spécialisé A
    ├─ Agent spécialisé B
    ├─ Agent spécialisé C
    │
    └─ étapes contrôlées / conditions / états / validations
```

C’est plus important qu’il n’y paraît. Des travaux récents sur le scaling des systèmes agentiques ont trouvé que la coordination multi-agent apportait de forts gains sur certaines tâches parallélisables, alors que tous les dispositifs multi-agents étudiés dégradaient les performances de 39 à 70 % sur une catégorie de tâches de raisonnement séquentiel dans leurs expérimentations. citeturn16search0turn16search4

D’autres travaux trouvent également que le débat peut parfois déplacer des agents d’une bonne réponse vers une mauvaise plutôt que corriger l’erreur initiale. citeturn16search3

La règle architecturale que je recommande est donc :

**Single agent by default, multi-agent by evidence.**

Passer au multi-agent lorsque l’un de ces avantages existe réellement :

- parallélisation de sous-tâches indépendantes ;
- expertises ou outils réellement différents ;
- séparation des responsabilités ;
- isolation de permissions ;
- validation indépendante utile.

Par exemple :

```text
                         Orchestrateur
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
      Research Agent     Code Agent       Data Agent
      Web + RAG          sandbox           SQL read-only
            │                 │                 │
            └─────────────────┼─────────────────┘
                              ▼
                         Verifier Agent
                              │
                              ▼
                      Policy / Approval
                              │
                              ▼
                         Final action
```

La valeur ne vient pas du fait que quatre LLM « discutent ». Elle vient du fait que les fonctions, contextes et permissions sont correctement séparés.


