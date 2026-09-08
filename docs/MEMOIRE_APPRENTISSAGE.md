# Mémoire et apprentissage dans GenOS

## 1. Objet et périmètre

Cette documentation décrit la mémoire et l’apprentissage du système GenOS tels qu’ils sont effectivement implémentés dans le dépôt. Elle n’est pas une vue de marché ou un modèle générique de “memory layer” : elle reflète les services, les tables SQLite, les primitives et les mécanismes de validation réellement présents dans le code.

Le cœur fonctionnel est centré sur :

- la mémoire épisodique dans [backend/src/services/episodicMemoryService.js](../backend/src/services/episodicMemoryService.js) ;
- la mémoire vectorielle dans [backend/src/services/vectorMemoryService.js](../backend/src/services/vectorMemoryService.js) ;
- la notation de score, la similarité et la métacognition dans [backend/src/services/memoryScoring.js](../backend/src/services/memoryScoring.js) ;
- la consolidation et le pruning dans [backend/src/services/sleepCycle.js](../backend/src/services/sleepCycle.js) ;
- la mémoire de négative knowledge dans [backend/src/services/primitiveHandlers/memoryDeadEnds.js](../backend/src/services/primitiveHandlers/memoryDeadEnds.js) ;
- la synthèse du Golden Path dans [backend/src/services/trajectoryService.js](../backend/src/services/trajectoryService.js) ;
- la provenance et la causalité dans [backend/src/services/provenanceResolver.js](../backend/src/services/provenanceResolver.js) ;
- les tables SQLite, FTS5 et vec0 dans [backend/src/db/schema.js](../backend/src/db/schema.js).

Le système combine :

- mémoire épisodique : expériences structurées d’un agent ;
- mémoire sémantique : faits, décisions et contenu indexé ;
- recherche vectorielle : similarité sur embeddings 768D ;
- FTS5 : recherche lexicale de type BM25 / texte ;
- sqlite-vec / vec0 : recherche vectorielle native dans SQLite ;
- graph / synapses : relations entre décisions et effets ;
- négative knowledge : échecs connus et dead ends ;
- plasticité : synaptic updates inspirées de STDP ;
- consolidation / oubli : decay, pruning et purge.

---

## 2. Définition fonctionnelle

GenOS traite la mémoire comme un mécanisme de contrôle, de rappel et de sélection, pas seulement comme un stockage d’informations.

### 2.1 Mémoire épisodique

La mémoire épisodique est le souvenir d’un événement concret :

- qui a agi ;
- dans quel contexte ;
- quelle action a été menée ;
- quelle observation a été faite ;
- quel score de récompense a été attribué.

Dans le dépôt, elle est enregistrée dans `episodic_memories` et structurée dans [backend/src/services/episodicMemoryService.js](../backend/src/services/episodicMemoryService.js). Chaque épisode contient :

- `agent_id`
- `session_id`
- `task_id`
- `turn_number`
- `action_type`
- `context_state`
- `action_input`
- `observation_output`
- `reward_score`
- `is_consolidated`
- `created_at`

La mémoire épisodique sert à reconstruire les trajets d’action et à décider s’une action a produit une bonne ou une mauvaise expérience.

### 2.2 Mémoire sémantique

La mémoire sémantique est représentée par les embeddings et les décisions au sens large, notamment dans `genome_decisions` et `trajectories`.

Les éléments sont stockés avec :

- `id` ;
- `title` ;
- `content` ;
- `category` ;
- `embedding_blob` ;
- `created_by` ;
- `organization_id`, `project_id` ;
- `synaptic_weight`.

Le service [backend/src/services/vectorMemoryService.js](../backend/src/services/vectorMemoryService.js) montre bien cette logique : un élément de mémoire n’est pas seulement texte brut, il porte un embedding, un poids synaptique et un contexte d’appartenance tenant.

### 2.3 Recherche vectorielle

La recherche vectorielle utilise des embeddings de dimension 768, calculés par des vecteurs déterministes compatibles avec sqlite-vec. Le code de [backend/src/services/memoryScoring.js](../backend/src/services/memoryScoring.js) montre :

- `textToVector()` : conversion d’un texte en vecteur 768D ;
- `cosineSimilarity()` : mesure de similarité cosinus ;
- `scoreCorpusItem()` : pondération finale entre lexical, sémantique, score de poids synaptique et recency.

La recherche ne se résume pas à l’algorithme vectoriel pur ; elle intègre également :

- lexical match ;
- tags ;
- recency ;
- credibility ;
- inhibition par signal négatif ;
- “golden path” explicite ;
- dead-end avoidance.

---

## 3. Mathématiques du système mémoire

### 3.1 Similarité vectorielle

Le cœur du score est la similarité cosinus :

$$
\text{sim}(u, v) = \frac{u \cdot v}{\|u\|\|v\|}
$$

C’est l’équation utilisée dans [backend/src/services/memoryScoring.js](../backend/src/services/memoryScoring.js) pour comparer le vecteur de requête avec les mémoires candidates.

### 3.2 Score hybride

Le score final est un mélange de :

- score lexical / TF-IDF ;
- similarité cosinus ;
- bonus de tags / termes ;
- bonus de succès ;
- poids synaptique ;
- recency vs. âge ;
- crédibilité / source.

On peut le voir sous la forme :

$$
S = f(hybrid, w_{syn}, c_{cred}, r_{recency}, h_{hormone})
$$

où :

- $hybrid$ = fusion de score lexical et vectoriel ;
- $w_{syn}$ = poids synaptique de la mémoire ;
- $c_{cred}$ = multiplicateur de crédibilité ;
- $r_{recency}$ = facteur de récence basé sur la date et la decay ;
- $h_{hormone}$ = éventuelle modulation “dopamine”, “adrenaline”, etc.

### 3.3 STDP et plasticité

Le code de [backend/src/services/primitiveHandlers/memory.js](../backend/src/services/primitiveHandlers/memory.js) implémente un mécanisme inspiré de la plasticité synaptique. La mise à jour suit le principe :

- si `postSpikeAt > preSpikeAt`, le signe est positif ;
- si l’ordre est inverse, le signe est négatif ;
- le gain dépend de `learningRate`, `tauPlus`, `tauMinus`, `transmitterType`.

La formule simplifiée est :

$$
\Delta w = \eta \cdot e^{-\frac{|\Delta t|}{\tau}} \cdot m
$$

avec :

- $\Delta t = t_{post} - t_{pre}$ ;
- $\eta$ = learning rate ;
- $\tau$ = constante temporelle ;
- $m$ = facteur de neuromodulation (dopamine, sérotonine, etc.).

Le système ajuste ensuite la quantité de :

- `receptor_density`
- `c3_opsonization`
- `cd47_expression`
- `activity_history`

ce qui donne une trace concrète de plasticité et d’oubli adaptatif.

### 3.4 Decay et pruning

Le service [backend/src/services/sleepCycle.js](../backend/src/services/sleepCycle.js) applique des règles de décadence et de pruning :

- `synaptic_weight = synaptic_weight * 0.9`
- `memory_synapses.weight = weight * 0.95` sur les synapses inactives
- suppression si :
  - `ABS(weight) < minTransmissionWeight`
  - ou `(c3_opsonization > 0.5 AND cd47_expression < 0.5)`.

Cela ressemble à un mécanisme d’oubli, de consolidation et de nettoyage immunitaire. Le but n’est pas d’effacer brutalement la connaissance : c’est d’assigner une valeur de pertinence dynamique et d’éliminer ce qui est devenu faible, non utile, ou potentiellement contaminé.

---

## 4. Biologie du modèle de mémoire

GenOS s’inspire explicitement des circuits biologiques de la mémoire cognitive, mais sans prétendre à une simulation du cerveau humain complète.

### 4.1 Mémoire épisodique = hippocampe

Le service [backend/src/services/episodicMemoryService.js](../backend/src/services/episodicMemoryService.js) suit le schéma hippocampique : on enregistre un épisode, puis le système le consolide selon un score de récompense. La mémoire est donc :

- contextualisée ;
- orientée par l’action ;
- réévaluée dans le temps ;
- filtrée par récompense et pertinence.

### 4.2 Mémoire sémantique = cortex / index conceptuel

Les embeddings, les tags, les catégories et les décisions forment une mémoire sémantique. La recherche vectorielle dans [backend/src/services/vectorMemoryService.js](../backend/src/services/vectorMemoryService.js) agit comme un cortex de récupération : on ne cherche pas seulement le texte exact, mais des éléments proches en sens.

### 4.3 STDP = apprentissage associatif

Le mécanisme de STDP est directement inspiré de la neurobiologie :

- un pré-synapse puis un post-synapse strengthens the connection ;
- l’ordre temporel est important ;
- la force des synapses dépend de la causalité et de l’activité.

Dans le dépôt, `memory_synapses` est la table qui matérialise cette mémoire de relation entre décisions ou souvenirs.

### 4.4 Oubli / pruning = microglie + sommeil

Le cycle de sommeil dans [backend/src/services/sleepCycle.js](../backend/src/services/sleepCycle.js) fonctionne comme une consolidation plus un nettoyage neural :

- renforcer les mémoires actives ;
- déprécier celles qui ne sont plus utilisées ;
- supprimer les synapses faibles ou contaminées ;
- purger les mémoires orphelines ;
- retirer les trajectoires rejetées trop anciennes.

Le système ne garde pas tout. Il agit comme une mémoire à capacité limitée, avec nettoyage continu.

---

## 5. Architecture réelle du dépôt

### 5.1 Tables et données

La base est initialisée dans [backend/src/db/schema.js](../backend/src/db/schema.js). Les éléments clés sont :

- `episodic_memories` : expériences temporelles ;
- `genome_decisions` : faits, décisions, mémoires sémantiques ;
- `memory_synapses` : relations causales et poids ;
- `trajectories` : séquences historiques ;
- `provenance_records` : chaînes de preuve / hash.

Le schéma ajoute également des index FTS5 et vec0 :

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS genome_decisions_fts USING fts5(...)
CREATE VIRTUAL TABLE IF NOT EXISTS genome_decisions_vec USING vec0(embedding float[768])
```

Cela permet :

- recherche lexicale en texte ;
- recherche vectorielle native ;
- hybrid retrieval : texte + similarité sémantique.

### 5.2 Flux de mémoire

Le flux type est :

1. un épisode est enregistré via `recordEpisode()` ;
2. un contenu est encodé en embedding ;
3. le système stocke la décision / mémoire dans `genome_decisions` ;
4. la recherche interroge via hybrid vector + FTS5 ;
5. les résultats sont filtrés par score, tenant, provenance et inhibition ;
6. le cycle de sommeil consolide, décroit et prune.

### 5.3 Service central

Le service [backend/src/services/vectorMemoryService.js](../backend/src/services/vectorMemoryService.js) agit comme point d’entrée de mémoire cognitive. Il fait le lien entre :

- embedding ;
- scoring ;
- graphRAG ;
- golden path prioritization ;
- fail-safe knowledge ;
- mémoire de sommeil.

---

## 6. Mémoire épisodique

### 6.1 Définition

La mémoire épisodique est le registre des expériences passées d’un agent : sa trajectoire, son contexte, son résultat, la récompense associée.

### 6.2 Implémentation

Dans [backend/src/services/episodicMemoryService.js](../backend/src/services/episodicMemoryService.js) :

- `recordEpisode()` stocke l’action et ses observations ;
- `getRecentEpisodes()` récupère les événements récents ;
- `consolidateEpisodes()` promue les épisodes de bonne qualité en “consolidated” ;
- `getEpisodeById()` permet de retrouver un épisode précis.

### 6.3 Règle de consolidation

Le score de récompense doit être dans [0,1]. Si le score dépasse un seuil (par défaut 0.7), l’épisode est consolidé. Si le score est faible, il peut être purgé.

Formellement :

$$
\text{consolidate}(e) = [r(e) \geq \theta] \land \text{valid}(e)
$$

avec :

- $r(e)$ = reward score ;
- $\theta$ = seuil de consolidation.

### 6.4 Cas d’usage

- replay d’un échec pour éviter le même bug ;
- apprentissage à partir d’une tentative de patch ;
- amélioration de tâches de planification ;
- synthèse de “résultats bonnes pratiques”.

---

## 7. Mémoire sémantique et recherche vectorielle

### 7.1 Recherche vectorielle

Le service [backend/src/services/vectorMemoryService.js](../backend/src/services/vectorMemoryService.js) effectue :

- embedding du texte ;
- recherche dans corpus ;
- fusion avec mémoires seed ;
- scoring par similarité ;
- sélection des meilleurs résultats ;
- priors sur golden path et pitfalls.

### 7.2 FTS5 et sqlite-vec

Le schéma [backend/src/db/schema.js](../backend/src/db/schema.js) crée explicitement :

- `*_fts` pour la recherche textuelle lexicale ;
- `*_vec` pour la recherche vectorielle native via vec0.

Cela donne un modèle hybride :

- FTS5 pour la recherche textuelle exacte / portée ;
- vec0 pour la similarité sémantique ;
- score hybride pour combiner les deux.

Cela est important : la recherche n’est pas seulement d’ordre “mot clé”. Elle s’appuie sur la sémantique, la structure, les tags et la trajectoire de la mémoire.

### 7.3 Qualité, provenance et contamination

La qualité de mémoire est renforcée par :

- `verified` / `is_verified` ;
- `created_by` ;
- `organization_id` ;
- `project_id` ;
- `synaptic_weight` ;
- provenance chain from [backend/src/services/provenanceResolver.js](../backend/src/services/provenanceResolver.js).

On voit aussi une logique de contamination / invalidation : dans la mémoire score, il existe des garde-fous pour les sources douteuses, les faits non vérifiés, ou les signes d’inhibition / contradiction.

---

## 8. Golden paths et chemins de réussite

### 8.1 Définition

Un Golden Path est un trajet de réussite dépouillé des mauvaises branches. Le service [backend/src/services/trajectoryService.js](../backend/src/services/trajectoryService.js) le synthétise par :

- classification des étapes ;
- élimination des `Dead-End` ;
- capture des étapes `Breakthrough`, `Verification`, `Exploration` ;
- calcul d’un % de reduction de bruit.

### 8.2 Rôle dans le système

Le service de mémoire recherche priorise explicitement les mémoires de type :

- `GoldenPath`
- `Trajectory`
- tags `golden_path` / `trajectory`

Cela aide à récupérer la voie de succès la plus fiable et à éviter de refaire des étapes coûteuses.

### 8.3 Exemple

Un agent qui a réussi à corriger un parser peut synthétiser une trajectoire :

- inspecter le point d’entrée ;
- retrouver le bug de récursion ;
- appliquer un garde-fou ;
- vérifier la sortie ;
- intégrer le patch.

Cette séquence devient un “golden path” utilisable comme plan de référence.

---

## 9. Dead ends et negative knowledge

### 9.1 Définition

Les dead ends sont des séquences, actions ou hypothèses qui ont été testées et se sont révélées mauvaises ou coûteuses. Le service [backend/src/services/primitiveHandlers/memoryDeadEnds.js](../backend/src/services/primitiveHandlers/memoryDeadEnds.js) s’occupe de :

- rechercher les échecs connus ;
- comparer la requête avec les mémoires de type `Failure` ;
- calculer une similarité ;
- bloquer l’action si la similarité dépasse un seuil.

### 9.2 Forme logique

On peut conceptualiser :

$$
\text{riskDeadEnd}(q) = \max_{f \in F} \text{sim}(q, f) \geq \tau
$$

où :

- $F$ = mémoires dont la catégorie est `Failure` ;
- $\tau$ = seuil de risque ;
- $q$ = nouvelle action ou tâche à évaluer.

### 9.3 Intérêt

Cela transforme la mémoire en mécanisme de sécurité : un agent ne réinvente pas une voie déjà testée et connue comme mauvaise.

---

## 10. STDP, plasticité et synapses

### 10.1 Table de synapse

Les synapses sont stockées dans `memory_synapses` avec des colonnes comme :

- `source_id`
- `target_id`
- `weight`
- `transmitter_type`
- `pre_spike_at`
- `post_spike_at`
- `delta_t_ms`
- `activity_history`
- `receptor_density`
- `c3_opsonization`
- `cd47_expression`
- `spine_morphology`
- `organization_id`
- `project_id`

### 10.2 Logique d’apprentissage

Dans [backend/src/services/primitiveHandlers/memory.js](../backend/src/services/primitiveHandlers/memory.js), le service `stdpUpdate()` :

- valide que `sourceId` et `targetId` sont distincts ;
- calcule `deltaT` ;
- applique un facteur de modulation selon le neurotransmetteur ;
- écrit le poids dans `memory_synapses` ;
- renforce ou affaiblit selon le signe du delta.

### 10.3 Cas d’usage

- associer un signal de cause à un effet ;
- renforcer les chemins de décision utiles ;
- identifie les schémas d’échec récurrents ;
- construire un graphe de mémoire causal.

---

## 11. Oubli, pruning et decay

### 11.1 Décadence naturelle

La decay est en grande partie dans [backend/src/services/sleepCycle.js](../backend/src/services/sleepCycle.js) :

- les décisions se dégradent progressivement ;
- les synapses inactives sont affaiblies ;
- les poids faibles sont retirés ;
- les trajets rejetés anciens sont purgés.

### 11.2 Objectif

Le système ne cherche pas à mémoriser toute l’histoire. Il s’efforce de garder :

- ce qui est utile ;
- ce qui est vérifié ;
- ce qui a une provenance claire ;
- ce qui reste causalement pertinent.

### 11.3 Conséquences

Cela évite que le système soit saturé par :

- l’ancien ;
- le bruit ;
- les mauvais résultats ;
- les chemins de renommés à tort.

---

## 12. Qualité, provenance et contamination de la mémoire

### 12.1 Qualité

La qualité d’une mémoire est évaluée à plusieurs niveaux :

- score de similarité ;
- récompense ;
- poids synaptique ;
- recency ;
- provenance.

Le service [backend/src/services/memoryScoring.js](../backend/src/services/memoryScoring.js) multiplie ces facteurs pour décider de la force d’un rappel.

### 12.2 Provenance

Les traces de provenance sont gérées par [backend/src/services/provenanceResolver.js](../backend/src/services/provenanceResolver.js). Le système peut retracer :

- une chaîne de hashes Merkle ;
- la hiérarchie d’un agent ;
- les nœuds de DAG ;
- les relations synaptiques entre décisions.

Cela réduit les risques de mémorisation sans origine claire.

### 12.3 Contamination

Le dépôt prévoit différents garde-fous pour éviter de contaminer la mémoire :

- exclusion des memories “inhibitorySignal” ;
- dead-end detection ;
- tenant scoping via `organization_id` et `project_id` ;
- check de validité épistémique ;
- filtering par provenance ;
- cycle detection / graph provenance.

La contamination n’est pas “théorique” : elle est explicitement prise en compte dans les filtres de recherche et les règles de synaptic update.

---

## 13. Cas d’usage du dépôt

### 13.1 Correction de bug avec mémoire accrue

Le système peut :

- enregistrer une erreur ;
- indexer la mauvaise tentative ;
- rappeler des chemins historiques ;
- proposer un Golden Path de correction ;
- éviter de refaire un dead end.

### 13.2 Exploration de stratégie

Un agent peut :

- comparer plusieurs hypothèses ;
- conserver les branches utiles ;
- éliminer les chemins de faible qualité ;
- utiliser la mémoire pour orienter le prochain appel.

### 13.3 Continue learning

Le système peut consolider les experts :

- mémoire épisodique des actions réussies ;
- mémoire sémantique des objets / contextes ;
- relations synaptiques entre événements ;
- sélection du meilleur chemin pour de futures missions.

### 13.4 Sécurité et gouvernance

En gardant des dead ends et des preuves de provenance, GenOS réduit le risque de :

- faire à nouveau une action déjà prouvée comme dangereuse ;
- se baser sur une source non verificable ;
- perdre la trace d’une décision construite dans un contexte spécifique.

---

## 14. Exemple concret de flux mémoire

### Exemple 1 — recherche de similarité

Une requête :

“parser recursion bug in model router”

est convertie en vecteur, comparée aux décisions stockées, puis classée selon :

- similarité vectorielle ;
- présence de tags `parser`, `recursion`, `bug` ;
- score de succès / preuve ;
- age de la mémoire ;
- éventuel dead-end risk.

Résultat :

- les décisions ayant déjà réparé un parseur sont récupérées ;
- les chemins de correction connus sont priorisés ;
- les résultats à la fois faibles et non vérifiés sont filtrés.

### Exemple 2 — STDP

Le système observe :

- une tentative de modifier le parser ;
- la suite a validé un patch correct ;
- la relation est renforcée dans `memory_synapses` ;
- la probabilité de réutiliser le même chemin augmente pour les missions similaires.

### Exemple 3 — oubli adaptatif

Un épisode peu réussi, ancien et non connecté est :

- décadé ;
- dégradé ;
- éventuellement supprimé lors du cycle de sommeil ;
- remplacé par des chemins plus récents et mieux vérifiés.

---

## 15. Schéma de mémoire

```text
Entrée / tâche
   ↓
Épisode (episodic_memories)
   ↓
Embedding 768D + indexation
   ↓
Stockage dans genome_decisions / trajectories
   ↓
Hybrid retrieval (FTS5 + vec0 + score hybride)
   ↓
Filtrage par: tenant, provenance, dead ends, inhibition
   ↓
Golden Path / negative knowledge / STDP
   ↓
Sleep cycle: decay, pruning, consolidation
   ↓
Mémoires réutilisables / mémoires purgées
```

---

## 16. Processus de fonctionnement réel

Le processus de mémoire dans GenOS suit cette logique :

1. Un agent exécute une action ou un plan.
2. L’épisode est enregistré dans `episodic_memories`.
3. Le contenu est transformé en mémoire sémantique avec embedding.
4. Une recherche de similarité priorise les indices utiles.
5. Les connaissances négatives et dead ends sont filtrées.
6. Un Golden Path est synthétisé si la trajectoire est réussie.
7. Les synapses sont mises à jour par STDP.
8. Un cycle de sommeil dépouille, consolide et prune la mémoire.
9. La provenance est persistée pour tracer la source de la mémorisation.

---

## 17. Comparaison avec le marché

| Outil / approche | Point fort | Limite | Positionnement d GenOS |
| --- | --- | --- | --- |
| Chroma / Pinecone / Weaviate | excellente recherche vectorielle | souvent peu de mémoire structurée sur trajectoire | GenOS combine vecteur + FTS5 + mémoire explicite + provenance |
| LangChain memory | mémoire de conversation | moins forte sur la mémoire documentaire / synaptique / causalité | GenOS apporte mémoire de décision, golden path, dead ends et STDP |
| Redis / journaling | rapide et simple | manque de structural memory et de causal graph | GenOS garde des relations entre décisions, poids synaptiques et trajectories |
| GraphRAG / knowledge graphs | relations sémantiques | peu de mémoire de récompense et d’oubli adaptatif | GenOS mélange graph + embedding + decay + plasticité |
| MLflow / experiment tracking | journalisation d’expériences | moins orienté raisonnement agentique | GenOS traite la mémoire comme moteur de décision autonome |

Le point différenciant est que GenOS ne considère pas la mémoire comme un simple cache. Elle est conçue comme un mécanisme d’adaptation, de sélection, de preuve et de sécurité.

---

## 18. Ce que GenOS fait bien

- combine mémoire épisodique, sémantique et vectorielle ;
- utilise FTS5 + vec0 pour du retrieval hybride ;
- réduit les erreurs par dead-end memory ;
- consolide les expériences par score de récompense ;
- synthétise les chemins de succès ;
- applique un oubli contrôlé pour maintenir une mémoire sanitaires ;
- trace la provenance de la connaissance ;
- protège la mémoire de la contamination / mauvaise source / mauvais tenant.

## 19. Limites et garde-fous

- le modèle est très inspiré par la neurobiologie, donc parfois plus “biomimétique” que strictement standard ;
- la mémoire est hiérarchisée mais non universelle : elle dépend des tables, des tenants et des workflows du runtime ;
- la provenance et la qualité ne sont pas une certification absolue, mais une couche de validation et d’auscultation ;
- le système prend en charge la “bonne mémoire”, mais il faut continuer à surveiller les biais d’apprentissage et la contamination de contexte.

---

## 20. Conclusion

La mémoire et l’apprentissage de GenOS sont structurés comme un système cognitif autonome, composé de plusieurs couches :

- épisodique pour les expériences ;
- sémantique pour les faits et les décisions ;
- vectorielle pour la similarité ;
- FTS5 / sqlite-vec pour l’accès hybride ;
- STDP pour la plasticité synaptique ;
- dead-end memory pour la sécurité cognitive ;
- golden path pour la référence de succès ;
- sleep cycle pour le pruning et la consolidation ;
- provenance pour la qualité et la confiance.

C’est un modèle de mémoire active, adaptative et autorégulée, conçue pour servir l’autonomie des agents et la robustesse de l’exécution.

Les références de code les plus importantes sont :

- [backend/src/services/episodicMemoryService.js](../backend/src/services/episodicMemoryService.js)
- [backend/src/services/vectorMemoryService.js](../backend/src/services/vectorMemoryService.js)
- [backend/src/services/memoryScoring.js](../backend/src/services/memoryScoring.js)
- [backend/src/services/sleepCycle.js](../backend/src/services/sleepCycle.js)
- [backend/src/services/trajectoryService.js](../backend/src/services/trajectoryService.js)
- [backend/src/services/primitiveHandlers/memoryDeadEnds.js](../backend/src/services/primitiveHandlers/memoryDeadEnds.js)
- [backend/src/services/primitiveHandlers/memory.js](../backend/src/services/primitiveHandlers/memory.js)
- [backend/src/services/provenanceResolver.js](../backend/src/services/provenanceResolver.js)
- [backend/src/db/schema.js](../backend/src/db/schema.js)
