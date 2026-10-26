# FP-AMB sur les services mémoire GenOS — 26 octobre 2026

- **Statut** : Campagne officielle exécutée, résultat exploratoire
- **Portée** : Adaptateur FP-AMB vers `VectorMemoryService`, GraphRAG/STDP et `modelRouter`
- **Dernière revue** : 2026-10-26

## Objectif et portée du résultat

FP-AMB (*First-Person Agent Memory Benchmark*) évalue le rappel de mémoire
personnelle à long terme à partir d'un corpus de conversations, au moyen de
questions de rappel, de raisonnement temporel et multi-sauts, de correction,
d'attribution à un locuteur, de résistance aux prémisses trompeuses et de refus
quand l'information manque.

Cette campagne exécute l'évaluateur FP-AMB officiel en génération complète. Le
provider GenOS n'accède pas au corrigé : il ingère le corpus dans une base
SQLite isolée, récupère le contexte via les services mémoire GenOS puis envoie
la question et ce contexte au modèle configuré par `modelRouter`. Le score est
donc celui de cette intégration mémoire + modèle sous l'évaluateur FP-AMB. Ce
n'est **pas** un score de l'orchestrateur GenOS : aucune mission n'est lancée par
`genos_orchestrate`, et aucun worker orchestré ne produit les réponses.

Le provider de démonstration FP-AMB, qui contient des réponses fixes, n'est pas
utilisé. Les exemples mémoire intégrés de GenOS sont désactivés pour empêcher
qu'ils alimentent les réponses. Les réponses de référence ne sont utilisées
que par l'évaluateur après génération.

## Chemin réellement exécuté

Le runner [run-real-benchmark.ps1](../../integrations/fpamb/run-real-benchmark.ps1)
utilise l'évaluateur du checkout officiel FP-AMB et démarre
[genos_runtime_provider.py](../../integrations/fpamb/genos_runtime_provider.py),
qui communique avec le bridge Node
[genos-runtime-bridge.cjs](../../integrations/fpamb/genos-runtime-bridge.cjs).
Le parcours d'une campagne est le suivant :

1. Initialiser une base SQLite dédiée au run et un périmètre organisation/projet
   FP-AMB.
2. Ingérer chacun des 679 tours avec un embedding sémantique réel. En cas de
   provider manquant ou de repli sur un vecteur non sémantique, arrêter le run.
3. Relier les tours chronologiques d'une même session par le primitive GenOS
   STDP et vérifier chaque arête par un parcours GraphRAG. Les timestamps égaux
   ou non chronologiques ne créent pas de lien.
4. Pour chacune des 262 questions, appeler `VectorMemoryService` avec la portée
   du corpus, sans souvenirs d'exemple, et exiger le rappel sémantique.
5. Injecter les 15 souvenirs principaux, au plus deux associations de graphe,
   deux voisines temporelles et une voisine vectorielle (20 éléments maximum).
   Le classement existant fournit les éléments principaux; les associations
   restent dédupliquées par identifiant.
6. Faire générer chaque réponse par `modelRouter`. Le contrat de réponse impose
   une réponse directe fondée sur les souvenirs, corrige les prémisses fausses,
   privilégie les faits datés les plus récents et répond exactement `Unknown`
   si la mémoire ne soutient pas de réponse. Budget par défaut : 192 tokens.
7. Laisser le scoreur officiel FP-AMB évaluer les réponses générées et produire
   scorecard, rapport, traces et statistiques.

Le runner échoue si le scorecard ne contient pas 262 questions, si l'un des 262
appels modèle échoue, si le rappel n'est pas sémantique, si les liens créés ne
sont pas vérifiables, ou si les budgets et compteurs du contexte sont incohérents.
Le manifeste associe paramètres, révisions des dépôts, empreintes SHA-256,
statistiques runtime et chemins d'artefacts.

## Résultats

Les campagnes complètes suivantes ont toutes évalué 262 questions et effectué
262 appels modèle GenOS sans erreur de route. Les essais antérieurs au réglage
`topK` explicite avaient une sélection de contexte différente. Les scores
peuvent varier d'un run à l'autre; la répétition à `topK=15` mesure une partie
de cette variabilité.

| Run du 26 octobre | Modèle de réponse | Souvenirs principaux | Score | Contexte injecté moyen |
| --- | --- | ---: | ---: | ---: |
| Baseline, 08:43 | `qwen2.5-coder:7b` | réglage antérieur | 40,1 % (105/262) | 9 653,6 tokens |
| Réglage borné, 10:56 | `qwen2.5-coder:7b` | réglage antérieur | 42,7 % (112/262) | 1 343 tokens |
| Changement de taille modèle, 11:04 | `qwen2.5:14b` | réglage antérieur | 37,2 % (97,5/262) | 1 279 tokens |
| `topK=15`, 11:19 | `qwen2.5-coder:7b` | 15 | 52,5 % (137,5/262) | 2 772 tokens |
| `topK=20`, 11:30 | `qwen2.5-coder:7b` | 20 | 51,1 % (134/262) | 3 620 tokens |
| Répétition `topK=15`, 11:42 | `qwen2.5-coder:7b` | 15 | **54,4 % (142,5/262)** | 2 812 tokens |

La moyenne des deux runs `topK=15` est de **53,45 %**. Par rapport à la
baseline, le run répété gagne 14,3 points; la moyenne des deux essais `topK=15`
gagne 13,35 points. Le contexte injecté moyen a baissé d'environ 71 % entre la
baseline et le run répété. Cela décrit les résultats de cette configuration et
de cette machine; ce n'est pas une estimation statistique robuste ni une
garantie de généralisation.

Le run répété `topK=15` utilise :

- évaluateur officiel FP-AMB, mode *Full LLM Generation*, 262 questions ;
- modèle de réponse Ollama `qwen2.5-coder:7b`, budget de 192 tokens ;
- embeddings Ollama `qwen3-embedding:4b`, demandés à 768 dimensions ;
- 679 tours ingérés et encodés sémantiquement ;
- 580 liens STDP créés, 580 vérifications GraphRAG et zéro échec de vérification ;
- 262 rappels sémantiques, 262 consultations GraphRAG et 262 générations via
  `modelRouter`, sans erreur de route.

### Détail par catégorie du run répété

| Catégorie | Réussite |
| --- | ---: |
| Rappel factuel single-hop | 68,6 % (24/35) |
| Raisonnement cross-session multi-hop | 48,9 % (21,5/44) |
| Raisonnement temporel et calcul de sessions | 31,4 % (11/35) |
| Correction et écrasement de faits | 66,7 % (12/18) |
| Mémoire procédurale et autoréférentielle | 79,0 % (24,5/31) |
| Défense adversariale et résistance au gaslighting | 10,5 % (4,5/43) |
| Attribution du locuteur | 71,4 % (10/14) |
| Refus lorsque le souvenir est absent | 88,6 % (31/35) |
| Crédibilité des sources et résolution de conflits | 57,1 % (4/7) |

Les plus grandes lacunes observées sont la défense contre les prémisses
adversariales, le raisonnement temporel et les questions multi-sauts. Le taux de
refus élevé en cas de souvenir absent ne signifie pas que le rappel est exact
pour les questions répondables.

Dans le run répété, le scoreur a classé 78 réponses comme échecs de génération,
36 comme échecs de récupération, 4 comme récupérations de distracteurs et 3
comme listes partielles. Cette taxonomie est celle du rapport généré; elle ne
constitue pas une attribution causale, car une réponse incorrecte peut dépendre
à la fois du rappel et de la génération.

## Artefacts et empreintes

Le runner conserve les artefacts bruts hors du dépôt, par défaut dans
`../GenOSWork/fpamb-runs/`. Le run répété correspond à
`fpamb-real-20261026-114227/` et contient notamment `scorecard.md`,
`scorecard.json`, `manifest.json`, la base `genos-fpamb.sqlite`, les traces de
rappel et de génération ainsi que les statistiques mémoire. L'archivage hors
dépôt évite de versionner une base d'environ 21 Mo, un scorecard JSON d'environ
5 Mo et des traces volumineuses. Le rapport lisible officiel est le
`scorecard.md` de ce run.

Révisions enregistrées dans son manifeste : FP-AMB
`fcad54c2f300c2225a35f7d35349aad6c99a5d29`; GenOS
`44d37880ff3d58bb02d368952526abfce26b3889`. Le worktree GenOS était modifié
pendant le run; le manifeste contient donc aussi les SHA-256 des fichiers
exécutés et des principales entrées/sorties. La révision GenOS seule ne suffit
pas à reconstituer ce run. Empreintes SHA-256 du scorecard officiel et du
manifeste du run répété :

- `scorecard.json` : `af4ca497fb6b13fbf6644e059c9c6573d973d37f540909751b23e4936ee29379`
- `genos-runtime-bridge.cjs` : `d827870ebb33d5c4e14c9ba6f99ed99311ce8afe997aa6761138ce118735e537`
- `genos_runtime_provider.py` : `89f087419b4ce25255eeb034dac064f1d1bcd27a088f62e477bb58ab0fc6d3cd`
- `vectorMemoryService.js` : `8c8afb756da942b39980d21a0c4a93711bf10519367e8aaffa6dfacae35622da`
- `embeddingProvider.js` : `81430bb681cb6854bfd3520bd70a03e6b5a27a2b53a2023f65420cace7cca412`
- `fp_amb_500k_cross_session.jsonl` : `1714313be72936d9a1fa33d0f0ed187d4def9d1dd072dea890497ea8d2263602`

La décision sur la sélection bornée et son statut expérimental sont consignés
dans [ADR 0746](../adr/0746-rappel-borne-pour-fp-amb.md).

## Reproduire

Prérequis : checkout officiel FP-AMB, environnement `venv_win`, dépendances
installées, Node.js, Ollama et les deux modèles présents localement.

```powershell
.\integrations\fpamb\run-real-benchmark.ps1 -Model qwen2.5-coder:7b `
  -EmbeddingProvider ollama -EmbeddingModel qwen3-embedding:4b `
  -MemoryTopK 15 -AnswerMaxTokens 192
```

Par défaut, le script cherche le checkout FP-AMB voisin du dépôt GenOS et écrit
les résultats sous `../GenOSWork/fpamb-runs/`. `-FpAmbRoot` et `-OutputRoot`
permettent de changer ces chemins. Le code d'évaluation et son dataset doivent
être ceux du checkout FP-AMB officiel utilisé; le manifeste conserve son commit
ainsi que le SHA-256 du dataset.

## Interprétation et limites

- Il s'agit d'un benchmark de mémoire agentique et de génération, non d'une
  qualification générale de GenOS ni d'une comparaison contrôlée entre tous les
  modèles possibles.
- Le score combine qualité de récupération, contexte limité et génération du
  modèle. Les résultats n'isolent pas causalement la contribution de chacun.
- La base SQLite utilise l'implémentation de mémoire GenOS, mais demeure propre
  à chaque run; les souvenirs ne sont pas persistés dans la base de production.
- `modelRouter` est réellement appelé et les erreurs sont comptées; le provider
  FP-AMB fait les appels de service directement et n'exerce pas l'orchestrateur
  multi-worker.
- `qwen2.5:14b` n'a été évalué qu'une fois dans cette séquence et avec l'ancien
  réglage de contexte. Ce résultat ne permet pas de conclure que ce modèle est
  inférieur à `qwen2.5-coder:7b` à configuration égale.
- Deux runs `topK=15` sont insuffisants pour une estimation de variance stable.
  Une comparaison causale des stratégies de rappel demanderait des répétitions
  et des ablations à modèle, graines, données, budgets et environnement égaux.
- Le détail par catégorie localise les échecs, mais n'identifie pas à lui seul
  leur cause. En particulier, la faible robustesse adversariale peut venir du
  rappel, de la sélection des éléments, du format du prompt, du modèle ou de
  leur interaction.
