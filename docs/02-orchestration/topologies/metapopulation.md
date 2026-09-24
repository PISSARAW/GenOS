# Metapopulation : Persistance Régionale malgré l'Instabilité Locale

- **Statut** : spécification de conception
- **Portée** : persistance régionale par populations semi-indépendantes, migration et recolonisation
- **Dernière revue** : 2026-09-24

## 1. Définition

Metapopulation dans GenOS est le mécanisme d'orchestration qui exécute une mission comme un **réseau de populations semi-indépendantes, localement adaptées et partiellement redondantes, capables d'échanger sélectivement des individus ou des connaissances, de survivre à des extinctions locales et de recoloniser les capacités perdues sans synchroniser tout le collectif**.

Le mot « Metapopulation » vient de l'écologie des populations : un système de populations séparées par des patches d'habitat, reliées par des corridors de migration, où la persistance globale émerge de la dynamique locale d'extinction et de recolonisation ([Hanski, 1998][ext-hanski]). GenOS emprunte ce concept : les dômes (populations locales) ne fusionnent pas en un état partagé ; ils vivent, divergent, échangent, s'éteignent localement, et recolonisent les patches vacants.

Les cinq principes de Metapopulation sont :

1. **Persistance régionale** : la capacité globale est maintenue tant que les fonctions critiques survivent dans au moins un dôme et que la capacité de recolonisation reste positive ;
2. **Semi-indépendance locale** : chaque dôme possède son propre espace de travail, sa mémoire locale, son budget, sa stratégie, et son évolution — les extinctions locales ne sont pas des échecs globaux ;
3. **Migration sélective** : les échanges sont typés (agents, génomes, procédures, artefacts, contre-exemples), conditionnés par la compatibilité, et validés localement par le receveur ;
4. **Anti-synchronisation contrôlée** : la connectivité est régulée pour préserver assez de diversité pour le rescue, mais pas assez pour homogénéiser ;
5. **Recolonisation fondée** : un patch vacant n'est pas restauré par clonage mais par sélection d'un *founder set* multi-linéage soumis à l'épreuve locale.

Metapopulation n'est pas une orchestration par partitionnement : c'est une orchestration par **dynamique de populations**. Les dômes ne sont pas des workers interchangeables ; ce sont des populations vivantes, adaptées localement, capables d'extinction et de renaissance.

Le cœur fonctionnel est réparti entre :
- [backend/src/services/metapopulationCoordinationService.js](../../../backend/src/services/metapopulationCoordinationService.js) : coordination opérationnelle, quorum, adaptation des corridors ;
- [backend/src/services/biologicalModeService.js](../../../backend/src/services/biologicalModeService.js) : composition des rôles Metapopulation ;
- [backend/src/services/proceduralMetapopulationService.js](../../../backend/src/services/proceduralMetapopulationService.js) : populations procédurales, collapse, recolonisation ;
- [crates/genos-orchestrator/src/evolution.rs](../../../crates/genos-orchestrator/src/evolution.rs) : dynamique évolutionnaire multi-îlots Rust ;
- [backend/src/services/cryptobiosisSporeService.js](../../../backend/src/services/cryptobiosisSporeService.js) : dormance et réactivation cryptobiotic ;
- [backend/src/services/fossilizationService.js](../../../backend/src/services/fossilizationService.js) : fossilisation et archive post-extinction.

Le principe est : un collectif capable de survivre à l'extinction locale de la moitié de ses dômes tout en préservant ses fonctions régionales, grâce à la migration sélective et à la recolonisation fondée, est plus résilient qu'un collectif où chaque worker est un point de défaillance unique.

---

## 2. Non un partitionnement statique, mais une dynamique de populations

GenOS applique une logique de populations semi-indépendantes :

1. **Dômes persistants** : chaque dôme maintient son propre état, son évolution, sa mémoire — ce ne sont pas des tâches éphémères ;
2. **Adaptation locale** : la fitness est évaluée dans le contexte local du dôme — `Fitness(x, deme_A) ≠ Fitness(x, deme_B)` par conception ;
3. **Migration conditionnelle** : les échanges sont typés, tracés par provenance, et validés par le receveur sous épreuve locale ;
4. **Extinction explicite** : un dôme peut s'éteindre (collapse) sans que la métapopulation échoue — c'est une transition d'état, pas un incident ;
5. **Recolonisation active** : un patch vacant est recolonisé par un *founder set* sélectionné, soumis à l'épreuve locale, et cultivé jusqu'à viabilité.

Les mécanismes de résilience sont explicites :
- **patch-dème separation** : une opportunité (patch) est distincte de la population qui l'occupe — permet `extinction → patch vacant → recolonisation` ;
- **local-first validation** : jamais `A dit bon → B adopte` ; toujours `A offre propagule → B quarantaine → B évalue localement → ACCEPT / REJECT / ADAPT` ;
- **fitness locale** : la valeur d'un individu dépend du contexte local, pas d'un score global ;
- **corridor plasticity** : les routes de migration s'adaptent selon l'historique de succès/échec des échanges ;
- **source-sink awareness** : les dômes source (producteurs nets) et sink (consommateurs nets) sont identifiés et protégés différemment ;
- **anti-synchrony governor** : la connectivité est régulée pour éviter la monoculture.

---

## 3. Définitions mathématiques de l'orchestration métapopulationnelle

L'orchestration Metapopulation est un problème de **persistance de fonctions critiques sous instabilité locale**.

Soit :
- $\mathcal{M}$ : mission globale ;
- $\mathcal{D} = \{D_1, D_2, \ldots, D_n\}$ : ensemble des dômes actifs ;
- $\mathcal{P} = \{P_1, P_2, \ldots, P_m\}$ : ensemble des patches disponibles ;
- $F_{\text{crit}}$ : ensemble de fonctions critiques que la mission exige ;
- $f(D_i)$ : fonction de fitness locale du dôme $D_i$ ;
- $\text{Cap}(D_i)$ : capacité du dôme $D_i$ à maintenir ses fonctions assignées ;
- $\text{Health}(D_i)$ : santé agrégée du dôme $D_i$ ;
- $\text{Synchrony}(D_i, D_j)$ : corrélation inter-dômes ;
- $\lambda_{\max}(M)$ : capacité métapopulationnelle (valeur propre dominante) ;
- $\text{RegionalContribution}(D_i)$ : contribution régionale du dôme $D_i$.

### 3.1 Persistance régionale

La propriété fondamentale de Metapopulation est la persistance régionale malgré les extinctions locales :

$$
\text{RegionalPersistence} = \underbrace{\left(\forall \phi \in F_{\text{crit}}, \exists D_i : \phi \in \text{Cap}(D_i)\right)}_{\text{CriticalFunctionsMaintained}} \land \underbrace{\left(\sum_{P_j \in \text{VACANT}} \text{RecolonizationCapacity}(P_j) > 0\right)}_{\text{RecolonizationCapacity} > 0}
$$

L'invariant central : **local failure ≠ regional failure**. Un dôme peut s'éteindre ($\text{Cap}(D_i) = 0$) sans que $\text{RegionalPersistence}$ passe à faux, tant que les fonctions critiques survivent dans d'autres dômes ET que la capacité de recolonisation reste positive.

### 3.2 Capacité métapopulationnelle

Inspirée de Hanski & Ovaskainen ([2000][ext-capacity]) :

$$
M_{ij} = \text{Quality}_i \times \text{Connectivity}_{ij} \times \text{Compatibility}_{ij} \times \text{Availability}_j
$$

où :
- $\text{Quality}_i$ : qualité intrinsèque du patch $i$ (ressources, accessibilité, contraintes environnementales) ;
- $\text{Connectivity}_{ij}$ : intensité du corridor de migration de $i$ vers $j$ ;
- $\text{Compatibility}_{ij}$ : compatibilité entre les représentations/stratégies du dôme source $i$ et du patch cible $j$ ;
- $\text{Availability}_{j}$ : disponibilité du patch $j$ ($0$ si occupé ou indisponible, $1$ si vacant et accessible).

La capacité métapopulationnelle est alors :

$$
\lambda_{\max}(M) = \text{valeur propre dominante de } M
$$

$\lambda_{\max}(M)$ mesure la **robustesse structurelle** du réseau : si $\lambda_{\max}$ diminue, le collectif devient fragile même si chaque dôme semble localement viable. Condition de viabilité :

$$
\lambda_{\max}(M) > \lambda_{\text{critique}} \implies \text{RegionalPersistence}
$$

où $\lambda_{\text{critique}}$ est un seuil calibré empiriquement selon la criticité de la mission (typiquement $\lambda_{\text{critique}} \in [0.3, 0.6]$).

### 3.3 Dynamique locale d'un dôme

Pour chaque dôme $D_i$, la santé est une combinaison pondérée de fitness, diversité, productivité, et stagnation :

$$
\text{Health}(D_i) = w_1 \cdot \text{LocalFitness}(D_i) + w_2 \cdot \text{Diversity}(D_i) + w_3 \cdot \text{Productivity}(D_i) - w_4 \cdot \text{Stagnation}(D_i)
$$

où les poids $w_k$ sont configurés par mission ($w_1 + w_2 + w_3 + w_4 = 1$). La stagnation est mesurée par l'absence de progression de la fitness locale sur une fenêtre glissante :

$$
\text{Stagnation}(D_i) = \max\left(0, 1 - \frac{\text{LocalFitness}(D_i, t) - \text{LocalFitness}(D_i, t - W)}{\text{LocalFitness}(D_i, t - W)}\right)
$$

Transition d'état du dôme :

$$
\text{Health}(D_i) < \theta_{\text{risk}} \implies D_i \to \text{AT\_RISK}
$$
$$
\text{Health}(D_i) < \theta_{\text{collapse}} \implies D_i \to \text{COLLAPSED}
$$

### 3.4 Fitness locale vs contribution régionale

Un dôme peut avoir une fitness locale médiocre mais une contribution régionale essentielle :

$$
\text{RegionalContribution}(D_i) = \alpha_1 \cdot \text{UniqueCap}(D_i) + \alpha_2 \cdot \text{EnvCoverage}(D_i) + \alpha_3 \cdot \text{Exports}(D_i) + \alpha_4 \cdot \text{RescueCap}(D_i) + \alpha_5 \cdot \text{DiversityContr}(D_i) - \alpha_6 \cdot \text{CorrFailureRisk}(D_i)
$$

Un **source deme** est un dôme avec $\text{RegionalContribution}(D_i) \gg \text{LocalFitness}(D_i)$ — il produit plus de valeur pour les autres dômes qu'il n'en consomme localement.

Un **sink deme** est un dôme avec $\text{LocalFitness}(D_i) < \theta_{\text{viable}}$ mais $\text{RegionalContribution}(D_i) > \theta_{\text{keep}}$ — il ne survivrait pas seul mais apporte une couverture environnementale unique (ex. : dôme Windows dans un environnement majoritairement Linux).

### 3.5 Synchronie computationnelle

Pour prévenir les échecs corrélés, GenOS mesure la synchronie entre dômes :

$$
\text{Synchrony}(D_i, D_j) = \rho\left(\text{ErrorVec}(D_i), \text{ErrorVec}(D_j)\right)
$$

où $\rho$ est le coefficient de corrélation de Pearson entre les vecteurs d'erreur (ou de fitness, de stratégie, de sortie) des deux dômes sur une fenêtre glissante.

La synchronie est mesurée sur cinq dimensions :
1. **Error correlation** : $\rho(E_i, E_j)$ — les mêmes erreurs dans les mêmes conditions indiquent une monoculture ;
2. **Strategy overlap** : similarité Jaccard des stratégies déployées ;
3. **Model overlap** : utilisation du même provider LLM ;
4. **Retrieval overlap** : similarité des sources consultées ;
5. **Artifact ancestry** : proportion d'artefacts partageant une ancêtre commune.

Règle de régulation :

$$
\text{Synchrony}(D_i, D_j) > \theta_{\text{sync}} \implies \text{reduce corridor}_{ij} \lor \text{mutate } D_i \lor \text{freeze elite migration}
$$

L'objectif est le **sweet spot de connectivité** : assez de corridors pour permettre le rescue, pas assez pour homogénéiser.

### 3.6 Coût et valeur de migration

Chaque migration consomme tokens, contexte, validation, latence, et risque d'intégration. La valeur nette :

$$
\text{MigrationValue} = \text{ExpectedReceiverGain} + \text{RescueValue} + \text{NoveltyValue} - \text{TransferCost} - \text{AssimilationRisk} - \text{HomogenizationRisk}
$$

Migration seulement si valeur positive ou nécessité critique. Le système apprend les politiques de migration sur l'historique : source, target, type de propagule, raison, état local pré/post, accepté ?, amélioration ?, perte de diversité ? — puis déduit `what tends to migrate well from A to B?`.

---

## 4. Les deux unités fondamentales : Patch et Deme

### 4.1 Patch : l'opportunité/localité

Un **patch** est une opportunité où une population pourrait vivre. Il définit le contexte environnemental, les contraintes, les ressources — sans contenir de population.

```
Patch {
    patchId: unique identifier
    environment: contexte (OS, provider, région, stratégie...)
    capacity: nombre maximum d'agents hébergés
    quality: score de qualité intrinsèque [0, 1]
    requirements: prérequis pour l'occupation
    accessibility: score d'accessibilité [0, 1]
    status: VACANT | OCCUPIED | UNAVAILABLE | QUARANTINED
}
```

Le patch est la **localité**. Il existe indépendamment de toute occupation. Un patch vacant est une opportunité non exploitée. Un patch quarantine est un environnement dangereux ou corrompu.

### 4.2 Deme : la population qui occupe

Un **dôme** est une population locale attachée à un patch. Il contient les agents, l'état local, la mémoire, la stratégie, et l'histoire évolutive.

```
Deme {
    demeId: unique identifier
    patchId: patch actuellement occupé
    members: ensemble des agents locaux
    localState: état local (workspace, mémoire, procédure...)
    lineage: lignée génétique/cognitive
    localFitness: fitness dans le contexte local [0, 1]
    diversity: diversité interne [0, 1]
    status: FOUNDING | ACTIVE | DECLINING | AT_RISK | COLLAPSED | RECOLONIZING | DORMANT
    healthSignal: signal liveness compact
}
$$

Le dôme est la **population vivante**. Il évolue, se reproduit, mute, échange, et peut s'éteindre. Sa fitness est évaluée localement — `Fitness(x, deme_A) ≠ Fitness(x, deme_B)` par conception.

### 4.3 Pourquoi cette séparation est essentielle

La distinction patch/dôme permet le cycle fondamental de Metapopulation :

```
Dôme s'éteint → Patch devient VACANT → Recolonisation par founder set → Nouveau Dôme FOUNDING → ...
```

Sans cette séparation, un dôme éteint ne pourrait pas être remplacé par un dôme différent (autre stratégie, autre modèle, autre lignée) sur le même patch. Le patch est le **substrat** ; le dôme est l'**occupant temporaire**.

---

## 5. Les cinq services de contrôle

### 5.1 DemeManager — Local Population Lifecycle

```
Role: deme_manager
ModelTier: frontier
Responsibility: Local Population Lifecycle
```

**Hypothèse :**
> "Maintain each deme as a semi-independent population with its own evolution, fitness evaluation, and local state."

**Mission assignée :**
```
Metapopulation mission: [shared mission]
Collective principle: A network of semi-independent populations with migration, extinction, and recolonization.

Your task (deme_manager):
1. Instantiate and maintain each deme in its patch context
2. Evaluate local fitness per deme (fitness is context-dependent)
3. Detect stagnation, decline, and collapse triggers
4. Trigger local evolution (mutation, reproduction, strategy change)
5. Publish health signals compact (no LLM prompt)

Return: deme states, fitness evaluations, status transitions, local evolution log
```

### 5.2 MigrationController — Typed Propagule Exchange

```
Role: migration_controller
ModelTier: frontier
Responsibility: Typed Propagule Exchange
```

**Hypothèse :**
> "Select, validate, and route typed propagules between demes under provenance, compatibility, and receiver-side validation."

**Mission assignée :**
```
Metapopulation mission: [shared mission]
Your task (migration_controller):
1. Select propagules per policy (elite, novelty, rescue, complementary, counterexample, cultural, founder)
2. Route via directed corridors (A→B may be excellent, B→A may be bad)
3. Enforce receiver-side quarantine and local validation
4. Track provenance, acceptance/rejection, and post-migration improvement
5. Adapt corridor weights based on utility history

Return: migration events, acceptance rates, corridor adaptations, utility deltas
```

### 5.3 RecolonizationController — Extinction Recovery

```
Role: recolonization_controller
ModelTier: frontier
Responsibility: Extinction Recovery
```

**Hypothèse :**
> "Recolonize vacant patches with founder sets selected from diverse lineages, subject to local trial and viability proof."

**Mission assignée :**
```
Metapopulation mission: [shared mission]
Your task (recolonization_controller):
1. Detect vacant patches and eligible source demes
2. Select founder sets (lineage A + lineage B + novel variant)
3. Instantiate founding population with restricted local trial
4. Monitor trial: FOUNDING → LOCAL_TRIAL → ACTIVE or FAILED
5. Consult fossils to avoid repeating extinct lineages
6. Trigger cryptobiotic restoration when spore available

Return: colonization events, founder sets, trial outcomes, restored capabilities
```

### 5.4 RegionalSignalController — Compact Liveness & Synchrony

```
Role: regional_signal_controller
ModelTier: standard
Responsibility: Compact Liveness & Synchrony
```

**Hypothèse :**
> "Maintain regional awareness of deme liveness, synchrony, and metapopulation capacity without LLM prompts."

**Mission assignée :**
```
Metapopulation mission: [shared mission]
Your task (regional_signal_controller):
1. Collect compact health signals from all demes (no LLM)
2. Compute regional metrics: λ_max, synchrony, coverage, fragmentation
3. Detect silent demes, correlated failures, monoculture risk
4. Trigger quorum when regional decisions are required
5. Publish regional state for monitoring

Return: regional health snapshot, synchrony matrix, quorum triggers, λ_max estimate
```

### 5.5 TopologyGovernor — Connectivity Sweet Spot

```
Role: topology_governor
ModelTier: standard
Responsibility: Connectivity Sweet Spot
```

**Hypothèse :**
> "Regulate migration topology to maintain enough connectivity for rescue but not enough for homogenization."

**Mission assignée :**
```
Metapopulation mission: [shared mission]
Your task (topology_governor):
1. Monitor synchrony across all deme pairs
2. Adjust corridor weights: increase for isolated pairs, decrease for over-synchronized pairs
3. Freeze or prune corridors that propagate failure or homogenize
4. Introduce firebreaks (temporary corridor shutdown) when correlated failure risk rises
5. Adapt topology variant (ring, stepping-stone, source-sink, small-world) per mission needs

Return: topology adjustments, corridor state, synchrony deltas, firebreak activations
```

---

## 6. Architecture du système

```text
                         MISSION GLOBALE
                               │
                               ▼
                        PATCH MODEL
                               │
            ┌──────────────────┼───────────────────┐
            ▼                  ▼                   ▼
         Patch A            Patch B             Patch C
            │                  │                   │
         Deme A             Deme B              Deme C
        ● ● ● ●            ● ● ●              ● ● ●
            │                  │                   │
            └──── corridors de migration ──────────┘
                               │
                               ▼
                    Regional Observer
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
      liveness            connectivity           synchrony
      fitness             migration              diversity
      lineage             source/sink            coverage
         │                     │                     │
         └────────────────────┬┴─────────────────────┘
                              ▼
                     Regional Contrôleur
                              │
      ┌───────────────────────┼──────────────────────────┐
      ▼                       ▼                          ▼
   DemeManager       MigrationController       RecolonizationController
      │                       │                          │
      └───────────────────────┴──────────────────────────┘
                              │
                              ▼
                    PERSISTANCE RÉGIONALE
```

### Fichiers d'implémentation

| Fichier | Rôle |
|---------|------|
| `backend/src/services/metapopulationCoordinationService.js` | Composition, quorum, régénération, adaptation connexions |
| `backend/src/services/biologicalModeService.js` | Définition et composition des rôles Metapopulation |
| `crates/genos-orchestrator/src/evolution.rs` | Multi-îlots Rust (sélection, reproduction, mutation, migration) |
| `backend/src/services/proceduralMetapopulationService.js` | Populations procédurales, collapse, recolonize |
| `backend/src/services/cryptobiosisSporeService.js` | Dormance et réactivation des dômes |
| `backend/src/services/fossilizationService.js` | Fossilisation et archive |

---

## 7. Politiques de migration

Metapopulation définit sept politiques, chacune répondant à WHEN, WHAT, FROM, TO, WHY — plus SHOULD receiver accept?

### 7.1 Elite Migration

Propager rapidement une amélioration locale avérée.

$$
\text{Migrant}_{\text{elite}} = \arg\max_{x \in D_i} \text{LocalFitness}(x)
$$

Source en progression régulière, receiver en stagnation modérée. Régulée par le TopologyGovernor si synchronie élevée (risque d'homogénéisation).

### 7.2 Novelty Migration (MultiKulti)

Injecter de la diversité. L'individu est choisi pour sa **différence** avec la cible ([Araujo et al., 2008][ext-multikulti]) :

$$
\text{Migrant}_{\text{novelty}} = \arg\max_{x \in D_i} \left(\text{LocalFitness}(x) \times \left(1 - \text{Similarity}(x, D_j)\right)\right)
$$

où $\text{Similarity}(x, D_j)$ mesure la similarité moyenne entre le migrant candidat et les membres du dôme cible. Quand : synchronie élevée, diversité en baisse, ou après extinction contrôlée pour recoloniser divergent.

### 7.3 Rescue Migration

Prévenir l'effondrement d'un dôme AT_RISK :

$$
\text{Migrant}_{\text{rescue}} = \arg\max_{x \in \text{sources}} \left(\text{Compat}(x, D_{\text{risk}}) \times \text{ExpectedImprovement}(x, D_{\text{risk}})\right)
$$

Mécanisme **pull** : le dôme en danger émet un signal de détresse avec les capacités manquantes. Injection contrôlée (peu de migrants, jamais un remplacement).

### 7.4 Complementary Migration

Transmettre une capacité manquante :

$$
\text{Migrant}_{\text{complementary}} = x \text{ such that } \text{Capability}(x) \cap \text{Missing}(D_j) \neq \emptyset
$$

Pull-based : le receveur demande une capacité $X$ ; les sources proposent les compatibles.

### 7.5 Counterexample Migration

Transmettre échec/contre-exemple/violation d'invariant. Le payload contient la condition d'échec, le contexte, la violation. Le receveur teste localement. Les erreurs deviennent des propagules défensifs pour protéger les autres dômes.

### 7.6 Cultural Migration

Transmettre procédures, artefacts, fragments de mémoire, heuristiques — sans déplacer d'agent. Types : `PROCEDURE`, `MEMORY_FRAGMENT`, `ARTIFACT`, `TOOL_CONFIGURATION`, `VERIFIER`, `TEST`. Exploite `culturalTransmissionService` et `culturalSelectionService` de la NCE.

### 7.7 Founder Migration

Fournir les propagules initiales pour la recolonisation :

$$
\text{FounderSet}(P_j) = \text{Select}\left(\{x \in \text{sources} \mid \text{Compatible}(x, P_j)\}, k\right)
$$

avec contrainte de diversité des lignées. Seule politique qui peut être **push** par le Regional Controller lors d'une recolonisation planifiée.

---

## 8. Push vs Pull Migration

**Push** : le dôme source initie l'envoi (elite, counterexample, cultural). Risque : submersion, propagules non désirées, homogénéisation par flooding. Contrôle : le receveur filtre par compatibilité et quarantaine avant assimilation.

**Pull** : le dôme receveur initie la demande (rescue, complementary, recolonisation). Avantage : besoin explicite, compatibilité évaluée par le demandeur, risque de submersion faible.

**Régulation** :

$$
\text{PushRatio} \propto \frac{\text{SourceCapacity}}{\text{ReceiverDemand}} \times \frac{1}{1 + \text{SynchronyRisk}}
$$

Quand la synchronie est élevée, le push est réduit (pour éviter l'homogénéisation) et le pull est maintenu (pour cibler les besoins réels).

---

## 9. Migration adaptative

La fréquence de migration n'est pas fixe. GenOS adapte l'intervalle selon l'état local de chaque dôme ([Mambrini & Sudholt, 2015][ext-adaptive]).

### 9.1 Règles d'adaptation

```
local progress élevé     → intervalle long (laisser le dôme progresser seul)
stagnation détectée      → raccourcir l'intervalle (opportunité de migration)
breakthrough détecté     → export sélectif immédiat (push elite/novelty)
diversité en baisse      → augmenter novelty migration, réduire elite
dôme en danger (AT_RISK) → déclencher rescue migration immédiate
synchrony élevée         → geler l'élite, ouvrir le novelty
```

### 9.2 Formule d'intervalle

Pour le corridor $(D_i, D_j)$ :

$$
\Delta t_{ij} = \Delta t_{\text{base}} \times \left(1 + \gamma_1 \cdot \text{Progress}(D_i) - \gamma_2 \cdot \text{Stagnation}(D_j) + \gamma_3 \cdot \text{Need}(D_j)\right)
$$

borné entre $\Delta t_{\min}$ et $\Delta t_{\max}$. Quand $D_j$ est en stagnation et $D_i$ en progression, $\Delta t_{ij}$ diminue — la migration est accélérée. Quand les deux dômes stagnent, la migration est ralentie (inutile de déplacer des problèmes).

### 9.3 Breakthrough detection

Un **breakthrough** est détecté quand :

$$
\text{LocalFitness}(D_i, t) > \overline{\text{LocalFitness}}(D_i, \text{window}) + k \cdot \sigma_{\text{local}}
$$

où $k$ est un facteur de sensibilité (typiquement 2.0). Déclenche un push sélectif : le dôme source offre son meilleur migrant aux dômes cibles dont la compatibilité est positive.

---

## 10. Source-Sink Dynamics

### 10.1 Définitions

Un **source deme** produit plus de capacité, d'innovation ou de migrants utiles qu'il n'en consomme localement :

$$
\text{SourceScore}(D_i) = \text{Productivity}(D_i) - \text{LocalCost}(D_i) + \text{MigrantExports}(D_i)
$$

Un **sink deme** ne survivrait pas seul mais apporte une couverture régionale unique grâce à l'immigration :

$$
\text{SinkScore}(D_i) = \text{EnvCoverage}(D_i) + \text{UniqueCap}(D_i) - \text{LocalFitness}(D_i)
$$

### 10.2 Protection des sinks

Il serait faux de retirer un dôme sink simplement parce que sa fitness locale est basse. Règle de protection :

$$
\text{SinkScore}(D_i) > \theta_{\text{protect}} \lor \text{UniqueCap}(D_i) > \theta_{\text{unique}}
$$

### 10.3 Corridors directionnels

Les corridors sont dirigés : $\text{Corridor}_{ij} \neq \text{Corridor}_{ji}$. Un source deme aura des corridors sortants forts (vers les sinks) et des corridors entrants faibles. Un sink deme aura des corridors entrants forts et des corridors sortants faibles.

---

## 11. Rescue Effect

### 11.1 Définition

Le **rescue effect** est l'injection contrôlée de migrants quand un dôme approche du collapse. Inspiré par l'écologie où la migration diminue le risque d'extinction locale ([Ryser et al., 2021][ext-rescue]).

### 11.2 Mécanisme

1. Le dôme $D_i$ passe en `AT_RISK` (health < $\theta_{\text{risk}}$) ;
2. Le Regional SignalController émet un signal de détresse avec les capacités manquantes ;
3. Les dômes source proposent des propagules compatibles (rescue migration) ;
4. **Quarantaine** : le receveur teste chaque propagule en isolation avant assimilation ;
5. Si le trial local améliore la health : `ACCEPT` et le dôme revient vers `ACTIVE` ;
6. Si le trial échoue : `REJECT` et la recherche continue.

### 11.3 Injection contrôlée

$$
|\text{RescueMigrants}(D_i)| \leq \max\left(1, \lfloor \beta \cdot |D_i| \rfloor\right)
$$

où $\beta \approx 0.2$. Le migrant est un **catalyseur**, pas un colon.

### 11.4 Condition de succès

$$
\text{Health}(D_i, t + \Delta t) > \theta_{\text{risk}} \land \text{Diversity}(D_i, t + \Delta t) \geq \text{Diversity}(D_i, t) - \epsilon
$$

---

## 12. Recolonisation ≠ respawn

Un patch vacant n'est pas restauré par clonage (la stratégie qui a causé l'extinction serait reproduite).

**Processus** : PATCH VACANT → sélection founder source(s) → sélection propagules → évaluation compatibilité → instantiation FOUNDING → bootstrap état local → trial local restreint → FOUNDING → ACTIVE (si viable) ou FAILED_COLONIZATION.

**Founder Set** :

$$
\text{FounderSet}(P_j) = \bigcup_{k} \{x_k \in \text{source}_k : \text{Compatible}(x_k, P_j)\}
$$

avec contrainte de diversité des lignées. Combine : lignée du dôme éteint (si contexte inchangé), lignée d'un source performant, et variante novelle.

**Cryptobiotic restoration** : $\text{Restate}(P_j) = \text{Spore}(\text{lastVerified}) \setminus \text{FailedStrategy} \cup \text{FounderSet}$ (via `cryptobiosisSporeService`).

**Fossilisation** : une population éteinte laisse un fossil via `fossilizationService`. Lors de la recolonisation : $\text{AvoidRepeat} = \forall x \in \text{FounderSet} : \text{Similarity}(x, \text{Fossil}) < \theta_{\text{novel}}$.

**Cycle de vie** :

```
[*] → FOUNDING : colonisation
FOUNDING → ACTIVE : validation locale
FOUNDING → FAILED_COLONIZATION : rejet
ACTIVE → DECLINING : stagnation
DECLINING → AT_RISK : health < seuil
AT_RISK → COLLAPSED : extinction
AT_RISK → ACTIVE : rescue effect
COLLAPSED → RECOLONIZING : founder set injecté
RECOLONIZING → ACTIVE : trial réussi
RECOLONIZING → COLLAPSED : trial échoué
DECLINING → DORMANT : cryptobiose
DORMANT → FOUNDING : réactivation spore
ACTIVE → DORMANT : extinction contrôlée
DORMANT → [*] : fossilisation
```

---

## 13. Les 12 variants de Metapopulation

### 13.1 Classic Patch

**Mécanisme :** Extinction + recolonisation classique sur patches fixes.
**Quand :** Résilience générale. Plusieurs populations sur patches stables, échanges modérés.
**Topologie :** Anneau ou small-world.
**Politique :** Founder (recolonisation), Elite (migration périodique).

### 13.2 Island Search

**Mécanisme :** Îlots de recherche indépendants + migration périodique d'incumbents.
**Quand :** Optimisation dure (SAT, ILP, local search, évolutionnaire).
**Topologie :** Anneau avec migration rare (préserve la diversité).
**Politique :** Elite + Counterexample. Les bornes migrent, les aussi les contre-exemples.

### 13.3 Heterogeneous Islands

**Mécanisme :** Chaque dôme utilise un algorithme, modèle, ou cognitive recipe différent.
**Quand :** Problèmes inconnus, couverture multi-stratégie ([da Silveira et al., 2022][ext-hetero]).
**Topologie :** Fully-connected mais avec validation stricte (haute diversité naturelle).
**Politique :** Complementary + Cultural.

### 13.4 Source-Sink

**Mécanisme :** Sources soutiennent sinks par migration dirigée.
**Quand :** Environnements inégaux (certains dômes ont plus de ressources).
**Topologie :** Dirigée (sources → sinks), corridors sortants forts depuis les sources.
**Politique :** Elite (push depuis sources) + Rescue (pull depuis sinks).

### 13.5 Rescue Network

**Mécanisme :** Redondance maximale et recolonisation rapide.
**Quand :** Systèmes critiques où aucune fonction critique ne doit être perdue.
**Topologie :** Small-world (forte connectivité, courts chemins de rescue).
**Politique :** Rescue + Founder. Haute sensibilité aux signaux AT_RISK.

### 13.6 Stepping-Stone

**Mécanisme :** Migration sparse, corridor par corridor (pas de saut direct A→C).
**Quand :** Préserver la diversité, éviter l'homogénéisation.
**Topologie :** Ligne ou grille. Migration rare.
**Politique :** Novelty + Cultural. Pas d'élite (trop homogénéisant).

### 13.7 Anti-Synchrony

**Mécanisme :** Diversité volontaire, firebreaks, extinction contrôlée de dômes redondants.
**Quand :** Réduire le risque d'échec corrélé global.
**Topologie :** Adaptive (le TopologyGovernor gèle des corridors).
**Politique :** Novelty dominante. Extinction contrôlée si synchrony > seuil.

### 13.8 Federated

**Mécanisme :** Données et états restent locaux. Seuls les propagules vérifiés migrent.
**Quand :** Sites privés, edge computing, data sovereignty, partitions réseau.
**Topologie :** Hierarchical avec corridors filtrés.
**Politique :** Cultural + Counterexample. Pas d'agent brut (pas de données brutes).

### 13.9 Ephemeral Patch

**Mécanisme :** Patches apparaissent/disparaissent dynamiquement.
**Quand :** Cloud (instances temporaires), sources temporaires, outils intermittents.
**Topologie :** Fully-connected mais volatile.
**Politique :** Elite push rapide + cryptobiotic spore (dormance quand le patch disparaît).

### 13.10 Persistent

**Mécanisme :** Dômes résidents entre missions.
**Quand :** Projets/services longs avec évolution continue.
**Topologie :** Stable, apprise sur l'historique.
**Politique :** Toutes selon le contexte. Les dômes accumulent mémoire locale et lignées matures.

### 13.11 Evolutionary

**Mécanisme :** Génome + mutation + migration + sélection locale.
**Quand :** NCE/optimisation évolutionnaire continue.
**Topologie :** Anneau ou small-world, paramétrable par `evolution.rs`.
**Politique :** Elite + Novelty + reproduction locale.

### 13.12 Cultural

**Mécanisme :** Les artefacts et procédures migrent plus que les agents.
**Quand :** Connaissances et procédures partagées, lignées culturelles distribuées.
**Topologie :** Small-world.
**Politique :** Cultural dominante. Les agents sont résidents ; les propagules culturels circulent.

---

## 14. Synchrony et Anti-Synchrony

### 14.1 Mesure de la synchronie

$$
\text{Synchrony}(D_i, D_j) = \rho\left(\text{ErrorVec}(D_i, \text{window}), \text{ErrorVec}(D_j, \text{window})\right)
$$

Mesurée sur cinq dimensions : error correlation, strategy overlap, model overlap, retrieval overlap, artifact ancestry.

### 14.2 Régulation par le TopologyGovernor

```
Synchrony(D_i, D_j) > θ_sync :
    Option 1 : Réduire le corridor A→B (moins d'échanges)
    Option 2 : Geler le corridor (firebreak temporaire)
    Option 3 : Muter D_i (changer modèle/stratégie/linéage)
    Option 4 : Extinction contrôlée de D_i + recolonisation divergente
```

### 14.3 Anti-Synchrony comme objectif

L'anti-synchrony n'est pas la décorrélation décorative — c'est un **firebreak cognitif**. Si trois dômes utilisent le même modèle, le même prompt template, et les mêmes sources, un bug de raisonnement du modèle les affectera tous simultanément.

Mesure globale :

$$
\text{AntiSyncIndex} = 1 - \frac{1}{\binom{n}{2}} \sum_{i < j} \text{Synchrony}(D_i, D_j)
$$

Un AntiSyncIndex cible (0.3–0.6) indique un bon compromis : les dômes sont assez différents pour éviter la monoculture, assez connectés pour permettre le rescue.

---

## 15. Types de quorum

Six types avec correction du faux quorum par pondération d'indépendance :

$$
\text{QuorumWeight}(D_i) = \mathbb{1}[\text{model}_i \notin \{\text{model}_{j \neq i}\}] \times \mathbb{1}[\text{lineage}_i \notin \{\text{lineage}_{j \neq i}\}] \times \mathbb{1}[\text{source}_i \notin \{\text{source}_{j \neq i}\}]
$$

| Type | Objectif | Seuil | Action |
|------|----------|-------|--------|
| **RISK_QUORUM** | Risque systémique | $k$ dômes AT_RISK ou $\lambda_{\max} < \lambda_{\text{crit}}$ | Rescue, freeze elite, firebreaks |
| **DISCOVERY_QUORUM** | Discovery régionale | $k$ dômes valident indépendamment | Diffuser en push |
| **MIGRATION_QUORUM** | Changement de politique | Consensus | Appliquer le changement |
| **RESCUE_QUORUM** | Approuver rescue | AT_RISK + source compatible + non-homogénéisant | Injecter en quarantaine |
| **EXTINCTION_QUORUM** | Extinction contrôlée | Redondant ou DORMANT prolongé | Éteindre, fossiliser, libérer |
| **PROMOTION_QUORUM** | FOUNDING → ACTIVE | Trial local réussi | Promouvoir, ouvrir corridors |

---

## 16. Liveness régional

Chaque dôme publie un **signal liveness compact** (~100 bytes, sans LLM) :

```
LivenessSignal {
    demeId
    timestamp           // millisecond epoch
    localStateVersion   // version monotone de l'état local
    health              // score de santé [0, 1]
    lastEvidenceAt      // timestamp de la dernière preuve produite
    migrationCapability // PUSH | PULL | BOTH | NONE
    recoveryCapability  // capacité locale de récupération
    statusTag           // NO_SIGNAL | HEALTHY_SILENCE | NO_NEW_INFO
                        // | DISCONNECTED | CRASHED | STALLED | UNKNOWN
}
```

### États de silence

| État | Interprétation | Action |
|------|----------------|--------|
| `NO_SIGNAL` | Aucun signal reçu | Vérifier si le dôme est CRASHED |
| `HEALTHY_SILENCE` | Dôme sain, rien à signaler | Normal |
| `NO_NEW_INFO` | Dôme actif, pas de nouvelle preuve | Normal |
| `DISCONNECTED` | Dôme injoignable (réseau) | Vérifier patch accessibility |
| `CRASHED` | Dôme non-répondant > seuil | Déclarer COLLAPSED, activer rescue/recolon |
| `STALLED` | Dôme ne progresse pas | Envisager migration ou mutation |
| `UNKNOWN` | État indéterminé | Enquête régionale |

### Détection d'extinction

$$
\text{statusTag} = \text{CRASHED} \lor \text{lastSignalAge} > \theta_{\text{grace}} \lor \text{health} < \theta_{\text{collapse}}
$$

La grâce $\theta_{\text{grace}}$ est configurée par mission (typiquement 30s–5min).

---

## 17. Speciation computationnelle

Quand deux dômes divergent significativement (représentations incompatibles, stratégies incompatibles, taux d'acceptation ≈ 0) :

$$
\text{Divergence}(D_i, D_j) = 1 - \text{Compat}(D_i, D_j) \times \text{AcceptRate}(D_i \to D_j) \times \text{AcceptRate}(D_j \to D_i)
$$

Si $\text{Divergence}(D_i, D_j) > \theta_{\text{species}}$ → **speciés**. Actions :
- Réduire les corridors (accepter la séparation)
- Introduire un MigrationAdapter (pont de traduction)
- Traiter comme des familles de stratégies distinctes

La speciation n'est pas un échec — c'est une forme de spécialisation. Deux dômes spécialisés dans des représentations différentes couvrent plus d'espace de recherche qu'un seul dôme généraliste.

---

## 18. Migration Adapters

Quand les représentations divergent, un adapter traduit les propagules d'un format source vers un format cible. Le receiver valide la traduction localement.

**Exemple** : Dôme A (SAT) → learned clause $C = (x_1 \lor \neg x_2 \lor x_3)$ ; Dôme B (ILP) ne peut pas la consommer directement ; Adapter SAT→ILP traduit en inégalité linéaire $x_1 + (1 - x_2) + x_3 \geq 1$ ; Validation locale dans le contexte ILP.

```
MigrationAdapter {
    adapterId
    sourceRepresentation   // format source (ex: SAT_clause)
    targetRepresentation   // format cible (ex: ILP_constraint)
    transform(payload)     // fonction de traduction
    validityCheck(payload) // vérifie la cohérence de la traduction
    confidence             // probabilité que la traduction soit valide
    lineage                // qui a créé/testé cet adapter
}
```

L'adapter est lui-même un propagule culturel. Découverte :

$$
\text{FindAdapter}(D_i, D_j) = \{a \in \text{AdapterRegistry} : \text{sourceRepr}(a) = \text{Repr}(D_i) \land \text{targetRepr}(a) = \text{Repr}(D_j)\}
$$

Si aucun adapter n'existe, un nouveau peut être proposé par un dôme qui maîtrise les deux représentations.

---

## 19. Cas d'usage

### 19.1 Optimisation multi-stratégie

```text
Deme A: CP-SAT        (● ● ● ●)
Deme B: ILP           (● ● ●)
Deme C: Local Search  (● ● ● ●)
Deme D: Evolutionary  (● ● ●)
```

Chaque dôme explore localement sa stratégie. Les incumbents migrent (elite push), les contre-exemples migrent (counterexample push). Si ILP stagne : migration depuis Local Search fournit un warm-start (complementary pull). Si un dôme échoue (bug solver) : collapse — aucun problème global. Le TopologyGovernor réduit les corridors entre C et D si leur synchrony augmente.

### 19.2 Multi-provider LLM

```text
Deme OpenAI:     GPT-based solvers (● ● ●)
Deme Anthropic:  Claude-based solvers (● ●)
Deme Local:      Ollama/Hermes solvers (● ● ●)
Deme Antigravity: Antigravity-based solvers (● ●)
```

Un outage OpenAI ne tue pas le collectif. Les dômes locaux fournissent la continuité. Éviter qu'un provider unique devienne cognitivement dominant (anti-synchrony). Les procédures validées migrent (cultural) entre providers.

### 19.3 Cybersécurité distribuée

```text
Deme Web:         (● ● ●)
Deme Identity:    (● ●)
Deme Infrastructure: (● ● ●)
Deme Supply Chain: (● ●)
```

Une vulnérabilité découverte dans Identity → propagule de sécurité vérifié migre vers les autres (counterexample push). Quarantaine d'un dôme contaminé → ne propage pas automatiquement son état. Recolonisation après nettoyage avec founder set incluant des stratégies de défense différentes.

### 19.4 Multi-environnement CI

```text
Deme Linux:   (● ● ● ●)
Deme Windows: (● ● ●)
Deme macOS:   (● ●)
Deme ARM:     (● ●)
```

Un patch fonctionne sur Linux → migrate vers les autres. Chaque receiver évalue localement. Si Windows rejette : adapter locally, puis une correction plus portable revient vers les autres (counterexample cycle). Dôme Windows protégé comme sink unique (couverture environnementale).

### 19.5 Recherche scientifique longue

```text
Deme Formal:    (● ● ●)  — méthodes formelles
Deme Empirical: (● ●)    — expérimentation
Deme Simulation: (● ● ●) — simulation
Deme Literature: (● ●)   — analyse de littérature
```

Chaque dôme maintient une école méthodologique pendant plusieurs semaines/missions. Les résultats migrent périodiquement (cultural). Les approches ne fusionnent pas prématurément. La speciation est attendue — elle représente une spécialisation.

### 19.6 Maintenance multi-repo / microservices

```text
Deme Auth:      (● ● ●)
Deme Payments:  (● ● ●)
Deme Frontend:  (● ●)
Deme Data:      (● ● ●)
```

Chaque service possède son dôme résident avec mémoire locale, agents, procédures et historique. Une vulnérabilité OAuth découverte dans Auth → propagule de sécurité vérifié migre vers les autres. Si Payments est indisponible : le reste de la métapopulation continue, puis recolonisation lorsque le service revient.

---

## 20. Escalade et cas d'erreur

### 20.1 Perte d'une fonction critique

```
METAPOPULATION_CRITICAL_FUNCTION_LOST:
  La fonction critique φ ∈ F_crit n'est maintenue par aucun dôme actif.
  λ_max(M) < λ_critique.
  Action : Recolonisation d'urgence du patch le plus compatible avec φ.
  Si échec : Escalade — la mission ne peut être complétée dans l'état actuel.
```

### 20.2 Monoculture globale

```
METAPOPULATION_GLOBAL_MONOCULTURE:
  AntiSyncIndex < 0.2 sur l'ensemble des dômes.
  Risque d'échec corrélé global.
  Action : Extinction contrôlée d'un dôme redondant + recolonisation divergente.
  Si persistant : Escalate.
```

### 20.3 Fragmentation extrême

```
METAPOPULATION_FRAGMENTATION:
  Aucun corridor viable entre dômes (toutes les compatibilités ≈ 0).
  Recolonisation impossible, rescue impossible.
  Action : Introduction de MigrationAdapters ou réduction de la speciation.
  Si échec : Escalate.
```

### 20.4 Sink sans source

```
METAPOPULATION_ORPHAN_SINK:
  Dôme D_i est sink et aucun source ne peut lui fournir de migrants compatibles.
  Action : Mutation locale intensive (evolutionary rescue) ou
  extinction contrôlée avec fossilisation.
```

### 20.5 Collapse en cascade

```
METAPOPULATION_CASCADE_COLLAPSE:
  Trois dômes ou plus passent COLLAPSED dans une fenêtre < θ_cascade.
  Le rescue est submergé.
  Action : Quorum RISK — freeze toutes les migrations, évaluer
  λ_max résiduel, déclencher recolonisation planifiée.
  Si λ_max reste < λ_critique : Escalade.
```

---

## 21. Télémétrie et observabilité

```text
sessionId, topology, tickCount
demes: [{demeId, patchId, status, health, localFitness, diversity, size}]
patches: [{patchId, status, capacity, quality, occupancy}]
migrationGraph: [{source, target, weight, accepted, rejected, utility}]
regionalHealth: {
    regionalCoverage, demeDiversity, recolonizationCapacity,
    sourceCapacity, synchronyRisk, antiSyncIndex, lambdaMax
}
extinctions: [{demeId, type, timestamp, recoveryStatus, fossilId}]
rescues: [{sourceDeme, targetDeme, success, healthDelta, diversityDelta}]
migrations: [{propaguleId, type, source, target, accepted, improvement, cost}]
colonizations: [{patchId, founderSet, trialOutcome, duration}]
speciations: [{demeA, demeB, divergence, adapterId}]
topologyAdjustments: [{corridor, action, reason, synchronyBefore, synchronyAfter}]
quorumActivations: [{type, trigger, decision, falsePositiveEstimate}]
```

---

## 22. Configuration et paramètres

### 22.1 Variables d'environnement

```bash
export GENOS_METAPOP_MIN_DEMES=3
export GENOS_METAPOP_MAX_DEMES=8
export GENOS_METAPOP_TOPOLOGY=adaptive
export GENOS_METAPOP_SYNC_TICK=5000
export GENOS_METAPOP_HEALTH_RISK_THRESHOLD=0.35
export GENOS_METAPOP_HEALTH_COLLAPSE_THRESHOLD=0.15
export GENOS_METAPOP_SYNC_TARGET_MIN=0.3
export GENOS_METAPOP_SYNC_TARGET_MAX=0.6
export GENOS_METAPOP_RESCUE_MAX_RATIO=0.2
export GENOS_METAPOP_RESCUE_GRACE_PERIOD=30000
export GENOS_METAPOP_FOUNDER_DIVERSITY_MIN=2
export GENOS_METAPOP_TRIAL_DURATION=60000
export GENOS_METAPOP_LAMBDA_CRITICAL=0.5
export GENOS_METAPOP_LIVENESS_INTERVAL=10000
export GENOS_METAPOP_LIVENESS_GRACE=30000
export GENOS_METAPOP_MIGRATION_BUDGET_RATIO=0.15
export GENOS_METAPOP_REGIONAL_TIMEOUT=300000
```

### 22.2 Ajustement par mission

Les paramètres sont ajustés par `metapopulationCoordinationService.js` selon la criticité de la mission :
- **Mission critique** : seuils de collapse plus élevés, rescue plus agressif, recolonisation plus rapide ;
- **Mission exploratoire** : seuils plus bas, plus de tolérance à l'extinction, anti-synchrony dominante ;
- **Mission longue** : topologie persistent, dômes résidents, culture dominante.

---

## 23. Contrat runtime

### 23.1 MetapopulationSession

```typescript
interface MetapopulationSession {
    sessionId: string
    missionId: string
    patchModel: Patch[]
    demes: Deme[]
    migrationGraph: MigrationRoute[]
    topology: 'ring' | 'stepping_stone' | 'star' | 'small_world' |
              'source_sink' | 'hierarchical' | 'adaptive'
    status: 'FORMING' | 'ACTIVE' | 'RECOVERING' | 'DEGRADED' | 'ESCALATED'
    tickCount: number
    lambdaMax: number
    antiSyncIndex: number
}
```

### 23.2 Patch

```typescript
interface Patch {
    patchId: string
    environment: PatchEnvironment
    capacity: number
    quality: number
    requirements: string[]
    accessibility: number
    status: 'VACANT' | 'OCCUPIED' | 'UNAVAILABLE' | 'QUARANTINED'
    metadata: Record<string, unknown>
}
```

### 23.3 Deme

```typescript
interface Deme {
    demeId: string
    patchId: string
    members: string[]
    localState: DemeLocalState
    lineage: LineageRef
    localFitness: number
    diversity: number
    status: 'FOUNDING' | 'ACTIVE' | 'DECLINING' | 'AT_RISK' |
            'COLLAPSED' | 'RECOLONIZING' | 'DORMANT'
    healthSignal: LivenessSignal
    createdAt: number
    lastProgressAt: number
    migrantExports: number
    migrantImports: number
    collapseCount: number
}
```

### 23.4 Propagule

```typescript
interface Propagule {
    propaguleId: string
    sourceDemeId: string
    targetDemeId: string
    type: 'AGENT' | 'GENOME' | 'COGNITIVE_RECIPE' | 'PROCEDURE' |
          'MEMORY_FRAGMENT' | 'CLAIM' | 'COUNTEREXAMPLE' | 'ARTIFACT' |
          'TEST' | 'VERIFIER' | 'STRATEGY' | 'TOOL_CONFIGURATION'
    payloadRef: string
    lineage: LineageRef
    sourceFitness: number
    novelty: number
    migrationReason: 'elite' | 'novelty' | 'rescue' | 'complementary' |
                     'counterexample' | 'cultural' | 'founder'
    compatibilityEstimate: number
    status: 'OFFERED' | 'QUARANTINE' | 'ACCEPTED' | 'REJECTED' | 'ADAPTED'
    cost: number
    createdAt: number
    acceptedAt?: number
    rejectedAt?: number
    rejectionReason?: string
    improvement?: number
}
```

### 23.5 MigrationRoute

```typescript
interface MigrationRoute {
    sourceDemeId: string
    targetDemeId: string
    direction: 'directed' | 'bidirectional'
    weight: number
    acceptedMigrations: number
    rejectedMigrations: number
    utility: number
    adaptationHistory: CorridorAdjustment[]
    frozen: boolean
    lastAdjustmentAt: number
}
```

### 23.6 LivenessSignal

```typescript
interface LivenessSignal {
    demeId: string
    timestamp: number
    localStateVersion: number
    health: number
    lastEvidenceAt: number
    migrationCapability: 'PUSH' | 'PULL' | 'BOTH' | 'NONE'
    recoveryCapability: number
    statusTag: 'NO_SIGNAL' | 'HEALTHY_SILENCE' | 'NO_NEW_INFO' |
               'DISCONNECTED' | 'CRASHED' | 'STALLED' | 'UNKNOWN'
}
```

---

## 24. Comparaison avec les autres topologies

| Aspect | Trinity | A-Team | Biocénose | Syncytium | Metapopulation |
|--------|---------|--------|-----------|-----------|----------------|
| **Décomposition** | Hypothèses (3) | Domaines (N) | Communauté (4) | État (4) | Populations semi-indépendantes (N) |
| **Synchronisation** | Asynchrone | Asynchrone | Asynchrone | **Synchrone** | **Adaptative** |
| **État** | 3 mondes | Domaines séparés | Partagé | **Unique, partagé** | **Multiple, local** |
| **Défaillance locale** | Hypothèse rejetée | Domaine isolé | Impact modéré | Divergence | **Extinction locale ≠ échec régional** |
| **Meilleur pour** | Explorer hypothèses | Multidisciplinaire | Robustesse critique | Temps réel | **Résilience par diversité** |

**Quand choisir Metapopulation :** résilience à pannes locales multiples, plusieurs stratégies/modèles/environnements coexistants, diversité objectif, dômes persistents, rescue/recolonisation exigences fonctionnelles.

**Quand ne pas choisir Metapopulation :** état partagé unique → Syncytium ; comparaison d'hypothèses → Trinity ; multidisciplinarité → A-Team ; communauté open → Biocénose.

---

## 25. Invariants

1. No dôme without a defined patch/local context
2. No migration without provenance
3. No migrant assimilation without receiver-local validation
4. No local extinction interpreted as regional failure
5. No recolonization considered successful before local viability is re-proven
6. No global synchronization merely for convenience
7. No migration policy allowed to erase regional diversity without measurable benefit
8. No source deme allowed to become a single point of failure unnoticed
9. No silent deme counted as healthy
10. No quorum based on correlated evidence treated as independent support
11. No recovery by simply cloning the state that caused the previous collapse
12. No route adaptation from a single anecdotal outcome

La réussite d'une Métapopulation se mesure par sa capacité à préserver les fonctions régionales malgré les extinctions locales.

---

## 26. Cas d'usage typiques

Les cinq cas ci-dessous suivent le même canevas : **Mission** (ce qu'on veut accomplir), **Déroulé** (comment la métapopulation s'organise et évolue), **Résultat** (ce qui est obtenu comparativement à une approche monolithique).

### 26.1 Audit de sécurité multi-provider

**Mission** : Auditer une application web (OWASP Top 10) en exploitant plusieurs LLM simultanément sans dépendre d'un provider unique.

**Déroulé** :
- 4 dèmes hétérogènes : `Deme-OpenAI` (GPT-4o), `Deme-Anthropic` (Claude), `Deme-Local` (Llama), `Deme-Deterministic` (outils statiques : Semgrep, Bandit, ZAP).
- Chaque dème audite le même code avec ses propres méthodes.
- Découverte d'une injection SQL par Deme-Anthropic → counterexample migre vers les autres (cultural migration).
- Deme-OpenAI valide indépendamment → DISCOVERY_QUORUM atteint → la vulnérabilité est confirmée.
- Outage Deme-OpenAI (rate limit) → Deme-OpenAI passe COLLAPSED → rescue depuis Deme-Local.
- Une heuristique de fuzzing découverte par Deme-Local migre vers Deme-Anthropic (novelty).

**Résultat** : 23 vulnérabilités trouvées (vs. 14 avec un seul provider). L'outage d'un provider n'a pas interrompu l'audit. Les contre-exemples circulent, réduisant les faux négatifs.

---

### 26.2 Migration progressive d'un monolithe en microservices

**Mission** : Décomposer un monolithe Rails en microservices (Auth, Payments, Notifications, Frontend) sur 6 mois, sans interruption de service.

**Déroulé** :
- 4 dèmes persistants : `Deme-Auth`, `Deme-Payments`, `Deme-Notifications`, `Deme-Frontend`.
- Chaque dème maintient sa mémoire locale, ses procédures de déploiement, son historique de bugs.
- Une faille OAuth découverte dans Auth → propagule de sécurité vérifié migre vers Payments et Frontend (cultural).
- Le service Payments devient instable (DB overload) → Payments passe AT_RISK → rescue migration injecte une procédure de retry depuis Frontend.
- Le patch Payments est momentanément indisponible (VACANT) → les autres dèmes continuent.
- Lorsque Payments revient : recolonisation avec founder set incluant la lignée originale + une stratégie de circuit-breaker différente.

**Résultat** : Zéro interruption de service pendant la migration. Chaque service a évolué localement avec ses propres heuristiques. Les incidents ne se propagent pas.

---

### 26.3 Résolution d'un problème d'optimisation combinatoire NP-hard

**Mission** : Minimiser le coût d'un planning de 500 tâches avec contraintes de précédence, ressources, et fenêtres temporelles.

**Déroulé** :
- 4 dèmes de recherche : `Deme-CP-SAT` (OR-Tools), `Deme-ILP` (Gurobi), `Deme-LocalSearch` (tabou), `Deme-Evolutionary` (NSGA-II).
- Topologie en anneau avec migration rare (toutes les 50 générations).
- Chaque dème explore localement son espace de solutions.
- CP-SAT trouve une bonne bound → elite push vers ILP (warm-start).
- Local Search stagne → le TopologyGovernor augmente son intervalle de migration.
- Evolutionary trouve un front de Pareto intéressant → novelty migration vers les autres.
- Gurobi expire (license) → Deme-ILP COLLAPSED → les autres dèmes continuent ; l'absence d'ILP est compensée par la diversité des trois autres.

**Résultat** : Solution à 2.3% de l'optimum (vs. 4.7% avec un seul solver). La panne de Gurobi n'a pas bloqué la recherche — la diversité des algorithmes a fourni des solutions alternatives.

---

### 26.4 Intégration continue multi-plateforme

**Mission** : Garantir qu'un projet open-source compile et passe les tests sur Linux, Windows, macOS, et ARM.

**Déroulé** :
- 4 dèmes : `Deme-Linux`, `Deme-Windows`, `Deme-macOS`, `Deme-ARM`.
- Un patch passe sur Linux → migrates vers les trois autres (elite push).
- Windows rejette (API Win32 incompatible) → receiver adapte localement, puis produit un counterexample qui remonte vers Linux (counterexample cycle).
- Le dème Windows est coûteux (agents CI payants) et a une fitness locale basse → il est marqué SINK (couverture environnementale unique) → protégé contre l'extinction.
- Le dème ARM est intermittemment disponible (don hardware) → géré en mode Ephemeral Patch avec cryptobiotic spore : quand le patch disparaît, le dème passe en DORMANT ; quand il revient, réactivation depuis la spore.
- Le dème Linux est la source principale → corridors sortants forts.

**Résultat** : Compatibilité garantie sur 4 plateformes sans qu'aucune ne bloque les autres. Le coûteux dème Windows est justifié par sa couverture unique.

---

### 26.5 Veille technologique distribuée pour une équipe R&D

**Mission** : Maintenir une veille continue sur 4 domaines (LLM, crypto, robotics, climate tech) avec des écoles méthodologiques distinctes.

**Déroulé** :
- 4 dèmes : `Deme-Formal` (méthodes formelles), `Deme-Empirical` (expérimentation), `Deme-Simulation` (simulation multi-agent), `Deme-Literature` (analyse de papiers).
- Chaque dème développe ses propres procédures d'analyse, heuristiques, et critères de pertinence.
- Spéciation attendue : Formal et Simulation divergent (représentations incompatibles) → un MigrationAdapter est introduit pour traduire les modèles formels en configurations de simulation.
- Découverte d'un papier important par Literature → cultural migration vers les autres (résumé + contre-exemples identifiés).
- Le dème Empirical est coûteux en compute → il passe en DORMANT pendant les périodes de basse activité, réactivé par spore.
- Breakthrough détecté dans Simulation → push sélectif des incumbents vers les autres dèmes.

**Résultat** : Couverture de 4 domaines sans fusion prématurée. Chaque école méthodologique est préservée. Les découvertes circulent même quand certains dèmes sont dormants.

---

## 27. Quand ne pas utiliser Metapopulation

Metapopulation est puissant mais coûteux. Cette section aide à décider quand une autre topologie est plus appropriée.

### 27.1 Tableau de décision

| Si votre mission présente... | Alors préférez... | Parce que... |
|---|---|---|
| Un **état partagé unique** qui doit rester fortement cohérent | **Syncytium** | Metapopulation maintient des états locaux divergents — impossible de garantir la cohérence forte sans dégrader les dèmes |
| **3 hypothèses** à comparer sur les mêmes données | **Trinity** | Metapopulation maintient des populations longives ; Trinity est conçue pour la comparaison expérimentale éphémère |
| **Multidisciplinarité par domaines** (frontend + backend + data) | **A-Team** | Les domaines sont connus et différents ; Metapopulation divise la population, pas les expertises |
| **Communauté open** avec ressources partagées et acteurs autonomes | **Biocénose** | Les ressources sont un bien commun ; Metapopulation suppose des patches distincts avec des corridors contrôlés |
| **Un seul environnement** (un OS, un provider, une stratégie) | **Topologie simple** (pas de méta-orchestration) | La métapopulation suppose des patches distincts — si tout est identique, la diversité est artificielle |
| **Temps réel collaboratif** (édition partagée, chat, whiteboard) | **Syncytium** | Metapopulation tolère la divergence ; le temps réel exige une vue partagée unique |
| **Mission éphémère** (< 5 minutes, une seule exécution) | **Topologie élémentaire** | Le coût d'instanciation des dèmes et du Regional Controller n'est pas amorti |
| **Données massives centralisées** (un seul dataset, un seul modèle) | **Biocénose** ou **Syncytium** | Metapopulation suppose que les dèmes ont leur propre contexte ; si tout le monde lit les mêmes données, les dèmes sont redondants |

### 27.2 Tests mentaux (arbre de décision)

Avant de choisir Metapopulation, passez ces tests mentalement :

**Test 1 — « Est-ce que mes agents doivent diverger ? »**
- Si oui → Metapopulation est candidate.
- Si non (tous les agents doivent converger vers la même vue) → **Syncytium**.

**Test 2 — « Ai-je plusieurs environnements, providers, ou stratégies distincts ? »**
- Si oui → Metapopulation est candidate.
- Si non (un seul environnement, une seule approche) → **Topologie simple** ou **Biocénose**.

**Test 3 — « Est-ce que l'extinction locale est acceptable ? »**
- Si oui → Metapopulation (c'est sa raison d'être).
- Si non (toutes les fonctions critiques doivent être maintenues simultanément) → **Rescue Network** (variante Metapopulation) ou **Biocénose**.

**Test 4 — « Les patches sont-ils stables dans le temps ? »**
- Si oui → Metapopulation classique.
- Si non (les patches apparaissent/disparaissent fréquemment) → **Ephemeral Patch** (variante Metapopulation) ou **Biocénose**.

**Test 5 — « Le coût de la migration est-il justifié ? »**
- Si oui (les migrations apportent régulièrement des améliorations) → Metapopulation.
- Si non (les dèmes sont déjà optimaux, les migrations sont du bruit) → **Topologie simple** (laissez les dèmes isolés).

**Test 6 — « Ai-je besoin d'un quorum global ? »**
- Si oui → Metapopulation (6 types de quorum).
- Si non (décisions purement locales) → **Rhizome** ou topologie décentralisée.

**Règle empirique** : Si vous échouez à plus de deux tests, une autre topologie est probablement plus adaptée.

---

## 28. Références internes

- [ORCHESTRATION.md](../orchestration.md) : orchestration générale
- [SYNCYTIUM.md](syncytium.md) : orchestration par état partagé
- [TRINITY.md](trinity.md) : orchestration comparative
- [A_TEAM.md](a-team.md) : orchestration multidisciplinaire
- [BIOME.md](biome.md) : orchestration par environnement
- [BIOLOGIE_COMPUTATIONNELLE.md](../../01-concepts/biologie-computationnelle.md) : cadre biologique
- [metapopulationCoordinationService.js](../../../backend/src/services/metapopulationCoordinationService.js)
- [proceduralMetapopulationService.js](../../../backend/src/services/proceduralMetapopulationService.js)
- [cryptobiosisSporeService.js](../../../backend/src/services/cryptobiosisSporeService.js)
- [fossilizationService.js](../../../backend/src/services/fossilizationService.js)
- [evolution.rs](../../../crates/genos-orchestrator/src/evolution.rs)

---

## 29. Références externes

| Référence | Apport |
|-----------|--------|
| [Hanski 1998][ext-hanski] | Fondements : populations séparées, migration, persistance régionale |
| [Fox et al. 2017][ext-hydra] | Extinctions locales peuvent augmenter persistance régionale |
| [Ruciński et al. 2010][ext-topology] | Impact de la topologie de migration sur l'island model |
| [MultiKulti 2008][ext-multikulti] | Migration du génotype le plus différent |
| [Mambrini & Sudholt 2015][ext-adaptive] | Fréquence de migration adaptative |
| [Ryser et al. 2021][ext-rescue] | Rescue effect et drainage effect |
| [Nakazawa 2015][ext-stage] | Rescue effect dans le modèle de Levins |
| [Hanski & Ovaskainen 2000][ext-capacity] | Capacité métapopulationnelle (λ_max) |
| [da Silveira et al. 2022][ext-hetero] | Îlots hétérogènes reconfigurables |
| [Bell 2017][ext-evol-rescue] | Sauvetage évolutionnaire |

[ext-hanski]: https://www.nature.com/articles/23876
[ext-hydra]: https://www.nature.com/articles/s41559-017-0271-y
[ext-topology]: https://arxiv.org/abs/1004.4541
[ext-multikulti]: https://arxiv.org/abs/0806.2843
[ext-adaptive]: https://ieeexplore.ieee.org/document/7358494
[ext-rescue]: https://www.nature.com/articles/s41467-021-24877-0
[ext-stage]: https://www.nature.com/articles/srep07871
[ext-capacity]: https://www.nature.com/articles/35008063
[ext-hetero]: https://arxiv.org/abs/2205.02916
[ext-evol-rescue]: https://www.annualreviews.org/content/journals/10.1146/annurev-ecolsys-110316-023011

---

## 30. Schémas d'architecture et de dynamique métapopulationnelle

### 30.1 Architecture d'une Métapopulation hétérogène

```mermaid
flowchart TB
    Mission["Mission globale"] --> PatchModel["Patch Model"]
    PatchModel --> Patches["Patches A, B, C..."]

    Patches --> DemeA["Dôme A\nCP-SAT\n● ● ●"]
    Patches --> DemeB["Dôme B\nILP\n● ●"]
    Patches --> DemeC["Dôme C\nLocal Search\n● ● ●"]

    DemeA --> CorridorAB["Couloir A→B\n(Propagule: bound)"]
    DemeB --> CorridorBC["Couloir B→C\n(Propagule: incumbent)"]
    DemeC --> CorridorCA["Couloir C→A\n(Propagule: counterexample)"]

    CorridorAB --> RegionalObserver["Regional Observer"]
    CorridorBC --> RegionalObserver
    CorridorCA --> RegionalObserver

    RegionalObserver --> Assessment["Assessment régional\nλ_max, synchrony, coverage"]

    Assessment --> Controller["Regional Controller"]

    Controller --> ActionMigrate["Migration\npush/pull"]
    Controller --> ActionRescue["Rescue\nmigration ciblée"]
    Controller --> ActionExtinct["Extinction\ncontrôlée"]
    Controller --> ActionRecolon["Recolonisation\nfounder set"]

    ActionMigrate --> Patches
    ActionRescue --> Patches
    ActionExtinct --> Patches
    ActionRecolon --> Patches
```

### 30.2 Séquence Extinction → Recolonisation

```mermaid
sequenceDiagram
    autonumber
    participant Deme as Deme A
    participant Observer as Regional Observer
    participant Controller as Regional Controller
    participant Patch as Patch A
    participant Source as Source Deme B
    participant Founder as Founder Set

    Deme-->>Crash: Extinction locale
    Deme-->>Observer: Dôme COLLAPSE
    Observer-->>Patch: Patch VACANT
    Observer->>Controller: Extinction détectée

    Controller->>Source: Pull: besoin de migrant
    Source->>Founder: Sélection propagules\n(lineage A + lineage B + variant C)
    Founder->>Patch: Quarantine + évaluation locale

    alt Compatible
        Patch->>Patch: FOUNDING → LOCAL_TRIAL → ACTIVE
        Patch-->>Observer: Recolonisation réussie
    else Incompatible
        Patch-->>Founder: REJECT
        Controller->>Source: Nouvelle tentative
    end

    Observer->>Observer: Recalcule λ_max régional
```

### 30.3 Machine à états Dôme

```mermaid
stateDiagram-v2
    [*] --> FOUNDING : Colonisation
    FOUNDING --> ACTIVE : Validation locale
    FOUNDING --> FAILED_COLONIZATION : Rejet

    ACTIVE --> DECLINING : Stagnation / saturation
    DECLINING --> AT_RISK : Health < seuil
    AT_RISK --> COLLAPSED : Extinction locale
    AT_RISK --> ACTIVE : Rescue effect

    COLLAPSED --> RECOLONIZING : Founder set injecté
    RECOLONIZING --> ACTIVE : Trial réussi
    RECOLONIZING --> COLLAPSED : Trial échoué

    DECLINING --> DORMANT : Cryptobiose
    DORMANT --> FOUNDING : Réactivation spore

    ACTIVE --> DORMANT : Extinction contrôlée
    DORMANT --> [*] : Fossilisation
```

### 30.4 Boucle de régulation de la synchronie

```mermaid
flowchart LR
    subgraph Mesure["Mesure continue"]
        ErrCorr["Error correlation ρ(E_i, E_j)"]
        StratOverlap["Strategy overlap"]
        ModelOverlap["Model overlap"]
    end

    subgraph Calcul["Calcul AntiSyncIndex"]
        SyncMatrix["Matrice Synchrony(D_i, D_j)"]
        AntiIdx["AntiSyncIndex = 1 - mean"]
    end

    subgraph Règle["Régulation"]
        Check{"AntiSyncIndex < 0.3 ?"}
    end

    subgraph Action["Actions"]
        ReduceCorr["Réduire corridor"]
        FreezeCorr["Geler corridor (firebreak)"]
        MutateDeme["Muter dôme"]
        ExtCont["Extinction contrôlée\n+ recolonisation divergente"]
    end

    ErrCorr --> SyncMatrix
    StratOverlap --> SyncMatrix
    ModelOverlap --> SyncMatrix
    SyncMatrix --> AntiIdx
    AntiIdx --> Check

    Check -->|Oui, synchronie élevée| ReduceCorr
    ReduceCorr --> FreezeCorr
    FreezeCorr --> MutateDeme
    MutateDeme --> ExtCont
    Check -->|Non, dans la cible| Maintenir["Maintenir politique"]
```

---

## 31. Implémentation & capacités (GenOS v3)

Service de coordination : `metapopulationCoordinationService.js`.
Capacités requises : `QUORUM`, `SYNAPTIC_PLASTICITY`, `RESILIENCE_RECOVERY`, `GENOME_EPIGENETICS`, `SWARM_METRICS`, `EPISODIC_MEMORY`, `SIGNALING_BUS`, `PROVENANCE`, `CAPSULES_SNAPSHOTS`, `EVIDENCE_BARRIER`, `EVOLUTION_REPRODUCTION`.
Contrat exposé par `topologyCapabilityService` et rendu effectif dans les leases d'outils.

Les dômes sont instanciés par `biologicalModeService.compose('metapopulation', mission)` avec les cinq services de contrôle. Le moteur évolutionnaire Rust (`crates/genos-orchestrator/src/evolution.rs`) gère la dynamique génétique haute-performance pour la variante Evolutionary. La cryptobiose, la fossilisation, et la recolonisation sont opérées par leurs services respectifs.

---

## 32. Architecture cible et plan d'évolution

Cette section décrit l'architecture visée et l'ordre proposé des travaux. Les étapes constituent un plan, pas une affirmation que tous ces mécanismes sont déjà disponibles. La façade publique reste `metapopulationCoordinationService.js`. Les dynamiques multi-îlots réutilisent `crates/genos-orchestrator/src/evolution.rs`, les lignées procédurales `proceduralMetapopulationService.js`, les individus `AgentDNA` et `agentEvolutionService`, ainsi que les services existants de cryptobiose, snapshots, fossilisation, signaling bus et indépendance épistémique. Le plan ne crée pas un troisième moteur évolutionnaire.

### 32.1 Modèle cible

Mission / région → registre de patches → dèmes locaux → corridors de migration dirigés → observateur régional → contrôleur régional → persistance régionale.

L'observateur régional suit liveness, fitness, diversité, lignées, synchronie, défaillances et connectivité. Le contrôleur peut migrer, secourir, isoler, diversifier, réorganiser les corridors, faire évoluer ou recoloniser selon l'état observé et les preuves disponibles.

L'ontologie sépare explicitement :

`Metapopulation ≠ Patch ≠ Deme ≠ Individual`

Le patch décrit le contexte local disponible ; le dème est la population qui l'occupe ; les individus sont les membres du dème. Les quatre rôles historiques (`population_isolator`, `quorum_sensor`, `synaptic_adaptor`, `regeneration_steward`) deviennent progressivement des fonctions de contrôle, pas des membres obligatoires de chaque population.

### 32.2 Invariants d'architecture

- Un dème ne peut écrire qu'à l'intérieur de sa frontière locale : `writes(deme_i) ⊆ localBoundary_i`.
- Les échanges inter-dèmes passent par un corridor ou un contrat régional explicite.
- Un corridor est dirigé : `A → B` n'implique pas `B → A`.
- Un propagule est évalué par le receveur en quarantaine avant assimilation : `ACCEPT`, `ADAPT_AND_ACCEPT`, `REJECT` ou `REQUEST_MORE_EVIDENCE`.
- La fitness d'un propagule à la source ne prédit pas sa fitness dans le dème receveur.
- Une extinction locale ne devient pas automatiquement un échec régional ; une recolonisation n'est réussie qu'après un essai local viable.
- Tout événement régional déterminant conserve séquence, révision, provenance, acteur et horodatage.

### 32.3 Ordre de réalisation en 18 PR

Les chantiers de conception sont regroupés en 18 livrables cohérents. L'ordre suit les dépendances entre contrats, persistance, isolation, migration et contrôle autonome.

| PR | Livrable | Contenu principal |
|---|---|---|
| **PR1 — livré** | Contrats et session persistante | Corriger l'ontologie ; définir la session Métapopulation, les contrats canoniques et un stockage événementiel versionné, reconstructible après redémarrage. |
| **PR2 — livré** | Modèle Patch / Deme | Registre et cycle de vie des patches et dèmes ; distinguer localité, population et individu. |
| **PR3 — livré** | Isolation et liveness | Capsules workspace par dème, frontières d'écriture via l'API, état/mémoire/budget locaux ; heartbeats append-only, santé et quarantaine sur violation. |
| **PR4 — livré** | Graphe et corridors | Graphe dirigé persistant, qualité/capacité dérivées des patches et politiques ring, stepping-stone, star, small-world, fully-connected, source-sink, hierarchical et adaptive. |
| **PR5 — livré** | Propagules et quarantaine receveur | Types et provenance persistés, quarantaine du receveur, validation/assimilation par adaptateurs enregistrés, rejet tracé et reçu d'assimilation. |
| **PR6 — livré** | Politiques de migration | Sélection elite, novelty, rescue, complementary, counterexample, cultural et founder ; plan push par receveur et requêtes pull ciblées. |
| **PR7 — livré** | Déclencheurs adaptatifs | Déclencher selon stagnation, amélioration ou génération, sous les limites de coût, risque de synchronisation et budget. |
| **PR8 — livré** | Source/sink et contribution régionale | Classer sources/sinks, mesurer la couverture de capacités distinctes et protéger les dèmes uniques malgré une fitness locale faible. |
| **PR9 — livré** | Rescue effect | Essais bornés depuis une source compatible, mesure du bénéfice et rollback avec reçu si le dème cible régresse ; corridor pénalisé. |
| **PR10 — livré** | Extinction et reprise | Déclarer l'extinction seulement si tous les workers sont indisponibles et qu'aucune fonction locale ne reste viable ; libérer le patch, conserver l'historique des causes et préparer la reprise avec références cryptobiose/snapshot/fossile et exclusion des lignées ayant déjà échoué. |
| **PR11 — livré** | Recolonisation vérifiée | Détecter les patches vacants, filtrer les lignées déjà échouées sur le patch, exiger deux lignées distinctes, garder le patch vacant pendant l'essai et ne créer le nouveau dème qu'après preuve locale de viabilité ; enregistrer les échecs. |
| **PR12 — livré** | Quorum indépendant | Pondérer une seule preuve par groupe indépendant (source ou modèle), garder abstentions et silences dans le dénominateur sans les compter comme soutien, et exposer la diversité des sources/modèles. |
| **PR13 — livré** | Anti-synchronie | Détecter les erreurs corrélées et le recouvrement de stratégies ; réduire le poids ou geler les corridors dirigés exposés et signaler les dèmes portant une capacité régionale unique. |
| **PR14 — livré** | Utilité et capacité régionale | Calculer la valeur nette bénéfice/coût de chaque migration, conserver les exceptions de rescue critique, estimer la capacité du réseau par itération de la matrice de corridors et exposer les mesures comme observations régionales. |
| **PR15** | Pont Rust et procédural | Relier les dynamiques multi-îlots Rust et les lignées de `proceduralMetapopulationService.js` sans dupliquer leurs moteurs. |
| **PR16** | Variantes et persistance | Définir les variantes comme politiques ; couvrir fédération, souveraineté des données, scopes persistants et daemons résidents locaux. |
| **PR17** | Topologies imbriquées et Morphogenèse | Autoriser une topologie locale par dème tout en conservant Métapopulation au niveau régional ; définir signaux et transitions Morphogenèse. |
| **PR18** | Runtime régional autonome | Ajouter le cycle `OBSERVE → DIAGNOSE → PLAN → EXECUTE → VERIFY → RECORD`, conditions d'arrêt, intégration bout en bout et benchmarks reproductibles. |

### 32.4 Tests d'acceptation régionaux

| Scénario | Résultat attendu |
|---|---|
| Un worker tombe, mais la fonction locale reste viable | Le dème n'est pas déclaré éteint. |
| Tous les workers d'un dème disparaissent | Dème `COLLAPSED`, patch `VACANT` ; les autres continuent si les fonctions régionales restent couvertes. |
| Un migrant performant à la source est inadapté à la cible | Le receveur le rejette après évaluation locale. |
| Un claim migré n'a pas de provenance | Rejet. |
| Une procédure migrée est incompatible | Adaptateur applicable ou rejet explicite. |
| Un dème demande une compétence absente | Migration pull ciblée vers une source compatible. |
| Le rescue détériore le dème cible | Rollback et corridor pénalisé selon le résultat. |
| Une recolonisation échoue à l'essai local | Échec enregistré et patch laissé vacant. |
| Une lignée a échoué pour la même cause | Elle est pénalisée comme fondatrice. |
| Plusieurs dèmes partagent modèle et source | Leur poids de quorum indépendant diminue. |
| Un dème est silencieux | Le silence n'est jamais interprété automatiquement comme une bonne santé. |
| Les migrations homogénéisent les stratégies | Le contrôle anti-synchronie intervient. |
| Un dème a une fitness basse, mais une couverture unique | Il est conservé si sa contribution régionale le justifie. |
| Un corridor est utile dans un sens et nuisible dans l'autre | Les poids A→B et B→A divergent. |
| Un ring est coupé ou un provider tombe | Fragmentation détectée ; les autres domaines de panne continuent. |
| Le runtime redémarre | Patches, dèmes, routes et événements sont reconstruits depuis la persistance. |
| Un dème exécute Trinity | Le niveau régional reste Métapopulation. |

### 32.5 Benchmarks à budget égal

Comparer modèle unique, agents parallèles statiques, A-Team, Biome, modèle à îlots fixes, migration en ring périodique et variantes Métapopulation avec/sans validation receveur, anti-synchronie, rescue et migration adaptative. Couvrir optimisation difficile, panne multi-provider, CI multiplateforme, maintenance multi-repo, débogage distribué, recherche longue, partitions réseau et flottes de workers avec pannes injectées.

Mesurer réussite de mission et survie des fonctions régionales après défaillance locale, taux d'extinction locale et d'échec global, temps de reprise et réussite de recolonisation, qualité par coût, bénéfice/coût de migration, diversité conservée, corrélation des erreurs, concentration des sources, exposition aux points uniques de défaillance, couverture unique et volume de communication. Maintenir le budget identique et publier protocole, fixtures et seuils. La métrique centrale est la performance régionale après défaillance locale.

### 32.6 Critère de réussite

Une Métapopulation réussit si les fonctions régionales critiques sont préservées, les défaillances locales contenues, les migrations sélectivement utiles, la diversité régionale suffisante, la capacité de recolonisation disponible et aucune défaillance systémique non résolue.

> Une bonne Métapopulation GenOS n'est pas celle où aucun dème ne meurt. C'est celle où des dèmes peuvent mourir sans que l'intelligence collective perde sa capacité à continuer, apprendre et recoloniser.
