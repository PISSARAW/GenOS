# FP-AMB sur les services GenOS

`genos_runtime_provider.py` adapte l'interface officielle FP-AMB aux services
`VectorMemoryService` et `modelRouter` du dépôt. Les réponses attendues ne sont
pas transmises à l'adaptateur. Le fournisseur standard `examples/genos_provider.py`
contient des réponses codées en dur et ne doit pas servir à mesurer GenOS.

Le script démarre une base GenOS SQLite isolée, ingère les tours avec un embedding
sémantique configuré, puis utilise `VectorMemoryService` pour le rappel hybride,
le filtre de lecture mémoire et GraphRAG sous un périmètre organisation/projet
complet. Les liens entre tours chronologiques passent par le primitive GenOS
STDP; chaque lien créé est vérifié par un parcours du graphe. Les tours dont les
horodatages source sont égaux ou non chronologiques ne produisent pas d'arête.
Le benchmark échoue si l'embedding sémantique, les liens graphe ou leurs vérifications manquent. Les
générations passent par le routeur GenOS et le scoreur officiel FP-AMB note les
réponses. Le run conserve les traces de rappel et les statistiques mémoire avec
le scorecard, la base et le manifeste.

Le contexte comprend les 15 souvenirs les mieux classés par GenOS, avec au plus
deux associations de graphe, deux voisines temporelles et une voisine vectorielle.
Les autres candidats restent consultables dans les traces, mais ne sont pas
injectés au modèle. Le connecteur demande une réponse factuelle brève, vérifie
les prémisses de la question contre les souvenirs et réserve `Unknown` aux faits
non étayés. Le budget de génération est de 192 tokens par défaut.
`-MemoryTopK` permet de régler le nombre de souvenirs principaux, entre 1 et 20.

Le provider FP-AMB reste synchrone et appelle les services GenOS directement via
le bridge Node. Il utilise la pile mémoire réelle, mais ne lance pas une mission
par `genos_orchestrate`.

Depuis la racine du dépôt, après avoir installé le checkout FP-AMB officiel,
son environnement virtuel et le modèle Ollama :

```powershell
.\integrations\fpamb\run-real-benchmark.ps1
```

Pour sélectionner un autre modèle ou checkout :

```powershell
.\integrations\fpamb\run-real-benchmark.ps1 -Model qwen2.5-coder:7b -FpAmbRoot C:\chemin\vers\FP-AMB -AnswerMaxTokens 192
```

Par défaut, le rappel sémantique utilise Ollama avec `qwen3-embedding:4b` et
demande à Ollama des vecteurs de 768 dimensions. Pour choisir un autre modèle
d'embedding ou un autre endpoint :

```powershell
.\integrations\fpamb\run-real-benchmark.ps1 -EmbeddingModel nomic-embed-text -EmbeddingUrl http://127.0.0.1:11434
```

Le projet mémoire couvre tout le corpus FP-AMB afin que les questions
inter-sessions puissent rappeler des souvenirs d'autres sessions. Les liens
STDP restent limités aux tours chronologiques d'une même session. Les exemples
de mémoire fournis avec GenOS sont désactivés pour ce test : seules les lignes
ingérées depuis le corpus FP-AMB peuvent fournir des éléments de réponse.

Une campagne complète n'est valide que si elle traite 262 questions et que
262 appels modèle GenOS réussissent sans erreur de route. Le runner vérifie
aussi que chaque tour a reçu un embedding sémantique, que les liens STDP créés
sont tous parcourables par GraphRAG, que les 262 requêtes utilisent le rappel
sémantique et GraphRAG, et que le contexte retourné reste borné. Il écrit un
manifeste avec les révisions des deux dépôts, les paramètres, les compteurs
runtime et les SHA-256 des entrées et sorties principales.

Le rapport et l'historique des runs du 26 octobre 2026 sont dans
[le dossier de preuve FP-AMB](../../docs/06-benchmarks/fp-amb-genos-2026-10-26.md).
Par défaut, les artefacts détaillés sont conservés hors du dépôt sous
`../GenOSWork/fpamb-runs/` : ils contiennent notamment la base SQLite, les
traces de requêtes et la sortie complète du scoreur officiel. Le score mesure
le raccord des services mémoire GenOS et de `modelRouter` à FP-AMB; il ne mesure
pas une mission exécutée par `genos_orchestrate`.
