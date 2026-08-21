# SECTION 4 : GÉNÉTIQUE MOLÉCULAIRE, ÉPIGÉNÉTIQUE ET AUTO-GUÉRISON MÉMOIRE

## 4.1. Opérons Polycistroniques et Réseaux de Régulation Génique (GRN)

```
   [Promoteur] ──► [Opérateur / Garde] ──► [Gène A : Prompt] ──► [Gène B : Outil] ──► [Gène C : Format]
        │                   │
        │             (Liaison Répresseur / Validation Invariant)
        ▼
   Activation Atomique du Bundle Polycistronique
```

1. **Bundles Polycistroniques de Compétences** : Regroupement atomique et indissociable d'un promoteur d'activation, d'un opérateur de garde-fous de sécurité, et de 3 cistrons structuraux (Instruction Système, Schéma d'Outil MCP, Validateur de Structure JSON/Rust).
2. **Atténuation Transcriptionnelle** : À l'instar de l'opéron `trp`, si les premières réflexions révèlent que la tâche est triviale, la génération du prompt complet est avortée immédiatement.
3. **Motifs GRN d'Uri Alon** : Intégration de *Feed-Forward Loops* (FFL) pour le filtrage de bruit de signal, de commutateurs bistables pour la mémoire de décision binaire, et de repressilateurs pour l'alternance cyclique de phases d'exploration/synthèse.

---

## 4.2. Régulation Épigénétique et Dynamique de la Chromatine

```
       [ ADN / Génome Immuable de l'Agent ]
                        │
       ┌────────────────┴────────────────┐
       ▼                                 ▼
[ HAT : Acétylation ]             [ HDAC : Désacétylation ]
Euchromatine (Décondensation)     Hétérochromatine (Condensation)
- Instructions pleinement actives - Compression vectorielle dense
- Outils injectés dans le contexte - Masquage complet du prompt
- Haute fidélité sémantique       - Empreinte token = 0
```

1. **Vecteur d'État Épigénétique** : Chaque capacité génomique $k$ est associée à un score de méthylation $e_k \in [-1.0, +1.0]$ :
   - $e_k > +0.3$ (**Hétérochromatine Condensée**) : Masqué de la fenêtre de contexte LLM, mais conservé en mémoire vectorielle indexée pour réveil en $O(1)$.
   - $e_k \le +0.3$ (**Euchromatine Active**) : Décondensé et transcrit en texte clair dans le prompt système.
2. **Gains Mesurés** : Réduction de **60% à 80%** des tokens de pré-remplissage (*prefill*), éliminant les interférences d'attention entre directives contradictoires.

---

## 4.3. Éléments Transposables et Transfert Horizontal de Gènes (HGT)

```
[Agent Source : Trajectoire Validée] ──► [Compilation en Rétrotransposon]
                                                    │
                   ┌────────────────────────────────┴────────────────────────────────┐
                   ▼                                                                 ▼
[Intégration Locale (Génome Source)]                             [Plasmide MCP partagé sur le Swarm]
Mémorisation dans le store local                                 Diffusion horizontale sans redémarrage
```

1. **Rétrotransposons de Compétences** : Lorsqu'un sous-agent résout un problème contrefactuel complexe, sa trajectoire d'exécution est compilée par `genos_compile_memory` en un transposon autonome (préconditions, code synthétisé, post-invariants).
2. **Plasmides MCP** : Le transposon est encapsulé dans un `PlasmidPackage` et publié sur le store partagé. Les agents frères en cours d'exécution absorbent le plasmide et intègrent l'outil instantanément.

---

## 4.4. Système Immunitaire CRISPR-Cas9 et Réparation NHEJ/HDR

```
       [ Injection Prompt Hostile / Hallucination de Code ]
                                │
                                ▼
             [ Détection PAM / Invariant Break ]
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
[ Complexe CRISPR-Cas9 Virtuel ]              [ Cassure Double-Brin (DSB) ]
Clivage & Neutralisation du Payload                     │
Mémorisation du Spacer dans l'Array           ┌─────────┴─────────┐
                                              ▼                   ▼
                                      [ Réparation NHEJ ] [ Réparation HDR ]
                                      Patch d'urgence     Réconciliation exacte avec
                                      heuristique         branche parente (LCA)
```

1. **Filtrage Pré-Inférence CRISPR-Cas9** : Les signatures d'attaques adversariales (jailbreaks, fuites de prompt) sont stockées sous forme d'empreintes de *Spacers*. Avant l'inférence, tout motif complémentaire adjacent à un motif PAM est clivé et neutralisé.
2. **Double Voie de Réparation de la Mémoire** :
   - **NHEJ (Non-Homologous End Joining)** : Réparation d'urgence par religation heuristique directe de structures JSON ou AST corrompues pour maintenir la liveness.
   - **HDR (Homology-Directed Repair)** : Réconciliation à haute fidélité mathématique restaurant l'état de mémoire corrompu à partir de la branche saine parente dans `genos-store` (ancêtre commun le plus récent, LCA).

---

# SECTION 5 : NOUVEAUX PARADIGMES BIOLOGIQUES RADICAUX & ÉCOLOGIE MULTI-AGENTS

## 5.1. Systèmes Immunitaires Artificiels (AIS) et Théorie du Danger

```
+----------------------------------------------------------------------------------------------------+
|                                  ARTIFICIAL IMMUNE SYSTEM (AIS)                                    |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  1. CLONAL SELECTION          2. NEGATIVE SELECTION               3. DANGER THEORY (MATZINGER)     |
|     (Burnet's Theory)            (Thymic Censoring)                  (Damage-Associated Patterns)  |
|                                                                                                    |
|   High-affinity agent           New agent genomes screened          Immune activation triggered   |
|   trajectories cloned &         against "Self" invariants;          by system distress (DAMPs)     |
|   somatic hypermutations        autoreactive/hallucinatory          rather than rigid foreignness. |
|   applied inversely to fit.     subagents deleted at spawn.                                        |
|                                                                                                    |
|   [ Affinity Maturation ]       [ Anomaly / Rogue Detection ]       [ Zero-Day / Jailbreak Guard ] |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

### 5.1.1. Sélection Clonale et Hypermutation Somatique
Pour un agent ou une trajectoire de code ayant une affinité $\text{Affinity}(x) \in [0, 1]$ :
1. Expansion clonale : $N_{clones} = \lceil \beta \cdot \text{Affinity}(x) \rceil$.
2. Taux d'hypermutation somatique inversement proportionnel à l'affinité :
   $$\mu_i = \mu_{max} \cdot \exp\left(-\gamma \cdot \frac{\text{Affinity}(x)}{\text{Affinity}_{max}}\right)$$
   Les solutions quasi optimales bénéficient d'un micro-ajustement (exploitation), tandis que les solutions médiocres subissent de profondes mutations exploratoires.

### 5.1.2. Sélection Négative, Censure Thymique et Sécurité Dimensionnelle
Chaque nouveau génome d'agent ou bloc d'instructions système passe par une chambre thymique virtuelle de validation pré-déploiement :
- **Garde-Fou d'Invariance Dimensionnelle** : Avant tout calcul de distance, la compatibilité vectorielle est vérifiée de manière stricte : $\dim(\mathbf{c}) = \dim(\mathbf{s}) = D$. Tout candidat de dimension incompatible est immédiatement invalidé pour prévenir les paniques mémoires hors bornes (*out-of-bounds index*).
- **Filtrage Thymique contre l'Espace Self** :
  $$\text{Screening}(\mathbf{c}, \mathcal{S}) = \begin{cases}
  \text{Rejet (Incohérence Dimensionnelle)} & \text{si } \exists \mathbf{s} \in \mathcal{S}, \; \dim(\mathbf{c}) \ne \dim(\mathbf{s}) \\
  \text{Rejet (Apoptose Thymique Self)} & \text{si } \exists \mathbf{s} \in \mathcal{S}, \; \|\mathbf{c} - \mathbf{s}\|_2 \le r_{\text{self}} \\
  \text{Validation (Sentinelle Non-Self)} & \text{sinon}
  \end{cases}$$
- Les détecteurs matures survivants ne reconnaissent que l'espace *Non-Self* ($U \setminus S$), agissant comme sentinelles d'anomalies comportementales et de dérives de raisonnement à coût de calcul quasi nul.

### 5.1.3. Théorie du Danger de Matzinger et DAMPs
Au lieu de chercher à répertorier tous les jailbreaks possibles, le système écoute les signaux de dommage tissulaire **DAMPs** (Damage-Associated Molecular Patterns) :
- $\text{DAMP}_1$ : Cascades d'erreurs de parsing AST suite à l'ingestion d'un output d'outil.
- $\text{DAMP}_2$ : Pics d'entropie anormaux dans les diffs de code générés ($H_{diff} > \theta_H$).
- $\text{DAMP}_3$ : Tentatives d'élévation de privilèges ou d'accès fichier hors sandbox.
- $\text{DAMP}_4$ : Consommation exponentielle de tokens sans progression d'état (*Context Spinlock Burn*).

La détection d'un DAMP élève le signal d'alarme $D(t) \ge \theta_{danger}$, provoquant la mise en quarantaine immédiate de la branche.

---

## 5.2. Réseaux Mycéliens & Fungi (Wood-Wide Web)

```
+----------------------------------------------------------------------------------------------------+
|                                    MYCELIAL MESH ARCHITECTURE                                      |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|    [ Explorer Tip A ] --------\                                 /---------> [ Explorer Tip C ]     |
|          (Active)              \                               /                  (Active)         |
|                                 +---[ ANASTOMOSIS JUNCTION ]---+                                   |
|                                /     (Shared Memory & Mesh)     \                                  |
|    [ Explorer Tip B ] --------/                                  \--------> [ Worker Tip D ]       |
|                                                                                                    |
|    <==== [ Osmotic Nutrient (Token/Compute) Gradient Flow: Rich Nodes -> Starved Nodes ] ====>     |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

1. **Croissance Apicale des Hyphes** : Les agents explorateurs progressent dans l'arbre des fichiers guidés par la densité de nutriments $\mathcal{N}(path)$ :
   $$\mathcal{N}(path) = w_1 \cdot \text{Complexity}(path) + w_2 \cdot \text{TestFailureDensity}(path) + w_3 \cdot \text{RecentChurn}(path)$$
2. **Anastomose (Fusion d'Hyphes)** : Lorsque deux branches d'agents indépendants convergent vers le même module ($\Delta_{semantic} < \epsilon_{fuse}$), leurs parois fusionnent en une **Jonction Syncytiale** : réconciliation 3-way des croyances, pontage des curseurs de séquence et synchronisation sans message.
3. **Routage Osmotique de Nutriments (Tokens/Compute) & Plafond Donateur** :
   Chaque nœud d'hyphe $i$ calcule sa demande osmotique (pression de turgescence) :
   $$P_i = \frac{\text{WorkloadRemaining}_i}{\max(1, \text{TokenBalance}_i)}$$
   Lorsque $P_i > P_j$, un flux de transfert de tokens s'établit du nœud donateur $j$ vers le nœud demandeur $i$ selon l'équation de Hagen-Poiseuille directionnelle avec plafond de sécurité donateur :
   $$\Phi_{j \to i} = \begin{cases}
   \min\left(\kappa_{\text{max}} \cdot \text{Balance}_j, \; \kappa_{ji} (P_i - P_j)\right) & \text{si } P_i > P_j \\
   0 & \text{si } P_i \le P_j
   \end{cases}$$
   Le plafond donateur $\kappa_{\text{max}} = 0.20$ (20% maximum du solde de réserve transféré par cycle) garantit formellement qu'aucun nœud donateur ne peut être vidé de ses ressources ou poussé vers un solde négatif par des nœuds voraces ou compromis.

---

## 5.3. Stigmergie Phéromonale & Écologie Chimique

```
+----------------------------------------------------------------------------------------------------+
|                                    STIGMERGIC CHEMICAL ECOLOGY                                     |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  1. VOLATILE RECRUITMENT TRAILS       2. PERSISTENT EXPLORATORY TRAILS    3. ALARM PHEROMONES      |
|     - Fast evaporation (\tau_{fast})    - Slow decay (\tau_{slow})          - Repulsive gradient   |
|     - Immediate swarm concentration     - Structural solution highways      - Danger/Bug quarantine|
|                                                                                                    |
|  4. CASTE PRIMER PHEROMONES (QUEEN SUBSTANCE)                                                      |
|     - Regulates swarm-wide ratio of Explorers : Implementers : Reviewers without orchestrator     |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

Le champ stigmergique multi-composantes $\mathcal{C}_k(\mathbf{x}, t)$ sur l'AST et les fichiers est régi par :
$$\frac{\partial C_k(\mathbf{x}, t)}{\partial t} = D_k \nabla^2 C_k(\mathbf{x}, t) - \lambda_k C_k(\mathbf{x}, t) + \sum_{a \in \text{Agents}} \rho_k^{(a)} \delta(\mathbf{x} - \mathbf{x}_a(t))$$

1. **Phéromone de Recrutement Volatile ($\tau_{fast} \approx 60\text{s}$)** : Concentration d'agents sur un sous-problème complexe.
2. **Piste Structurale Persistante ($\tau_{slow} \approx 2\text{h}$)** : Autoroutes de navigation le long des chaînes d'outils ayant réussi les tests.
3. **Phéromone d'Alarme Répulsive** : Déposée sur les builds brisés et tests flaky, générant une force de répulsion $\mathbf{F}_{repulsive} = -\alpha \nabla C_{alarm}(\mathbf{x})$ évitant le gaspillage de tokens.
4. **Phéromone Primer de Caste** : Régulation homéostatique des ratios de sous-agents (Explorateurs vs Implémenteurs vs QA).

---

## 5.4. Morphogenèse, Cinétique de Gierer-Meinhardt & Stabilité CFL

```
+----------------------------------------------------------------------------------------------------+
|                                  MORPHOGENESIS & CELL FATE MATRIX                                  |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  1. TURING REACTION-DIFFUSION                 2. WOLPERT'S FRENCH FLAG MODEL                       |
|     Activator (u) vs Inhibitor (v)               Positional Information Gradient [M](x)            |
|     Generates self-organizing periodic           Thresholds dictate cell differentiation:          |
|     subagent cluster boundaries.                 [ High: Architect ] -> [ Mid: Coder ] -> [ Low: QA]
|                                                                                                    |
|  3. WADDINGTON'S EPIGENETIC LANDSCAPE                                                              |
|     Smooth canalization of agent state from pluripotent generalist to committed specialist.        |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

1. **Système de Réaction-Diffusion de Turing Régularisé** (Cinétique de Gierer-Meinhardt) :
   $$\frac{du_i}{dt} = \rho \frac{u_i^2}{v_i + \epsilon_v} - \mu u_i + \sigma_u + D_u \sum_{j \in \mathcal{N}(i)} (u_j - u_i)$$
   $$\frac{dv_i}{dt} = \rho u_i^2 - \nu v_i + \sigma_v + D_v \sum_{j \in \mathcal{N}(i)} (v_j - v_i)$$
   avec les garanties mathématiques suivantes :
   - $D_v \gg D_u$ (l'inhibition à longue portée stabilise l'auto-activation locale de l'activateur $u$).
   - $\sigma_v > 0$ (terme de production basale d'inhibiteur éliminant la singularité d'extinction $v \to 0$).
   - $\epsilon_v = 10^{-5}$ (régularisation stricte du dénominateur évitant toute division par zéro).
   
   **Condition de Stabilité Numérique de Courant-Friedrichs-Lewy (CFL)** :
   Pour toute discrétisation temporelle explicite du système sur le réseau spatial/topologique à pas spatial $\Delta x$, le pas de temps d'intégration $\Delta t$ doit impérativement respecter :
   $$\Delta t \le \frac{\Delta x^2}{4 \max(D_u, D_v)}$$
   Cette borne prévient toute divergence oscillatoire non physique lors des simulations multi-agents d'auto-organisation.

2. **Modèle du Drapeau Français de Wolpert** : Le gradient de morphogène $[M](x)$ le long de l'arborescence du code assigne le destin cellulaire de chaque agent :
   - $[M](x) \ge \theta_1 \implies$ **Architecte Système / API Gateway**
   - $\theta_2 \le [M](x) < \theta_1 \implies$ **Implémenteur Métier / Logique Centrale**
   - $[M](x) < \theta_2 \implies$ **Sentinelle QA / Vérificateur de Tests**

---

## 5.5. Plasticité Synaptique STDP & Scaling Homéostatique de Turrigiano

```
+----------------------------------------------------------------------------------------------------+
|                                  SYNAPTIC PLASTICITY MEMORY GRAPH                                  |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  1. STDP (SPIKE-TIMING CAUSALITY)             2. SLEEP CONSOLIDATION & PRUNING                     |
|     Pre -> Post (\Delta t >= 0): LTP (+ \Delta W)   Weak edges (W < \theta_{prune}) pruned.        |
|     Post -> Pre (\Delta t < 0): LTD (- \Delta W)    Collinear paths consolidated into abstractions.|
|                                                                                                    |
|  3. HOMEOSTATIC SYNAPTIC SCALING (TURRIGIANO)                                                      |
|     W_ij \leftarrow W_ij \cdot (TargetActivity / max(\epsilon, \bar{a}_i))^\gamma                  |
|     Stabilizes context window retrieval without hub node monopolization.                           |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

1. **Règle STDP Bi-Exponentielle Temporellement Rigoureuse** : La modification du poids de liaison $\Delta W_{12}$ entre le nœud pré-synaptique $M_1$ ($t_1$) et le nœud post-synaptique $M_2$ ($t_2$) est fonction de l'intervalle $\Delta t = t_2 - t_1$ :
   $$\Delta W_{12} = \begin{cases} 
   +A_+ \exp\left(-\frac{\Delta t}{\tau_+}\right) & \text{si } \Delta t \ge 0 \text{ (LTP Causal / Co-activation synchrone)} \\
   -A_- \exp\left(\frac{\Delta t}{\tau_-}\right) & \text{si } \Delta t < 0 \text{ (LTD Anti-causal / Rétrograde)} 
   \end{cases}$$
   - Pour $\Delta t \ge 0$ (causalité directe ou co-activation synchrone à $\Delta t = 0$), le lien est renforcé par potentialisation à long terme (+LTP) avec amplitude maximale $A_+$.
   - Pour $\Delta t < 0$ (activation post-synaptique antérieure), le terme $\exp(\Delta t / \tau_-) = \exp(-|\Delta t| / \tau_-)$ décroît exponentiellement vers 0 à mesure que l'écart anti-causal augmente, provoquant une dépression à long terme (-LTD).

2. **Élagage Synaptique de Phase de Sommeil** : Élimination des arêtes résiduelles $W_{ij} < \theta_{prune}$ et consolidation des cliques de croyances vérifiées en abstractions de haut niveau.

3. **Mise à l'Échelle Synaptique Homéostatique Multiplicative de Turrigiano** :
   $$W_{ij} \leftarrow W_{ij} \cdot \left( \frac{\mathcal{A}_{\text{target}}}{\max(\epsilon, \bar{a}_i)} \right)^\gamma$$
   où $\bar{a}_i = \sum_{k} W_{ki}$ représente l'activité synaptique convergente totale arrivant sur le nœud $i$, $\gamma \in ]0, 1]$ est le coefficient de compression homéostatique, et $\epsilon = 10^{-6}$.
   Ce mécanisme stabilise globalement le graphe de mémoire associative, empêchant les nœuds *hubs* hyper-activés de saturer la fenêtre de contexte LLM lors du rappel.

---

# SECTION 6 : MATRICE EXHAUSTIVE DE CORRESPONDANCE

| Phénomène Biologique | Formulation Mathématique / Modèle | Architecture Multi-Agent GenOS | MCP Tools & Crates Rust |
| :--- | :--- | :--- | :--- |
| **Charge Énergétique Atkinson** | $\text{EC}_{\text{reg}} = \frac{\max(0, [\text{ATP}]) + 0.5 \max(0, [\text{ADP}])}{\max(\epsilon, \sum \max(0, [\text{AXP}]))}$ | Gestionnaire de budget de tokens & calcul régularisé | `genos-runtime::metabolism` / `genos_metabolic_gate` |
| **Gouverneur AMPK** | Machine d'état à hystérésis ($\Delta_{\text{hys}} = 0.05$) | Throttling dynamique de modèle (Frontier $\to$ SLM $\to$ AST) | `genos-runtime::ampk` / `MetabolicRegime` |
| **Coopérativité de Hill** | $\theta = \frac{[L]^{n_H}}{K^{n_H} + [L]^{n_H}}$ | Commutation non-linéaire tout-ou-rien d'instructions et outils | `genos-core::allostery` / `HillGate` |
| **Modèle Allostérique MWC** | $T(t) = \text{clamp}(T_{\text{base}} [1 + \dots], 0.05, 1.20)$ | Gating dynamique de température $T$ et top-$p \in [0.10, 1.00]$ | `genos-model::sampling` |
| **Second Messager ($cAMP, Ca^{2+}$)** | Scalaires 32-octets sur mémoire partagée | Signalisation inter-agents ultra-légère hors contexte LLM | `genos-runtime::second_messenger` |
| **Cascade MAPK / Amplification** | $A_{\text{eff}} = \prod K_i \approx 10^3 \dots 10^6$ | Amplification de priorité de tâche et propagation d'interruption | `genos-runtime::cascade` |
| **Phosphodiestérases (PDE)** | $S(t) = S_0 \exp(-\lambda_{\text{PDE}} t)$ | Période réfractaire & amortissement anti-message-storm | `genos-runtime::pde` |
| **Opéron Polycistronique** | $\text{Bundle} = \langle P, O, [G_1, G_2, G_3] \rangle$ | Co-activation atomique : Prompt + Outil MCP + Schéma JSON | `genos-core::operon` / `PolycistronicBundle` |
| **Condensation Chromatinienne** | Vecteur épigénétique $\mathbf{e} \in [-1, 1]^M$ | Compression réversible de contexte (-70% tokens) avec rappel $O(1)$ | `genos-core::epigenetics` / `genos_epigenetic_condense` |
| **Transposons & Transfert HGT** | Trace $\xrightarrow{\text{RT}} \text{Plasmid} \xrightarrow{\text{Int}} \text{Skill}$ | Diffusion horizontale de compétences sans redémarrage | `genos-store::plasmid` / `genos_plasmid_transfer` |
| **Immunité CRISPR-Cas9** | Appariement PAM + Spacer | Clivage pré-inférence des injections et jailbreaks | `genos-world::crispr` / `genos_crispr_excise` |
| **Réparation d'Urgence NHEJ** | Religation heuristique de nœuds AST | Patch de liveness d'urgence après crash de syntaxe | `genos-eval::nhej` |
| **Réparation Homologue HDR** | Recombinaison guidée par matrice parente (LCA) | Auto-guérison de mémoire épisodique via `genos-store` | `genos-runtime::hdr` / `genos_restore` |
| **Sélection Clonale & Mutation** | $\mu_i = \mu_{max} \exp(-\gamma \cdot \text{Affinity})$ | Hypermutation somatique inversement proportionnelle au fitness | `genos-ais::clonal` / `genos_ais_clonal_hypermutate` |
| **Sélection Négative Thymique** | Sécurité dimensionnelle + $d(\mathbf{c}, \mathbf{s}) > r_{self}$ | Élimination à la création des sous-agents aberrants | `genos-ais::negative` / `genos_ais_negative_screen` |
| **Théorie du Danger (DAMPs)** | $D(t) = \sum \text{Severity}(\text{DAMP}_k) \ge \theta$ | Détection des dégâts tissulaires (AST, entropie, spinlock) | `genos-ais::danger` / `genos_ais_danger_telemetry` |
| **Croissance des Hyphes** | $\mathcal{N}(path) = \sum w_k f_k(path)$ | Exploration ciblée des zones à forte densité d'erreurs | `genos-mycelium::branching` |
| **Anastomose Syncytiale** | Fusion si $\Delta_{semantic} < \epsilon_{fuse}$ | Fusion d'arbres contrefactuels & réconciliation de mémoire | `genos-mycelium::anastomosis` / `genos_mycelial_anastomosis` |
| **Routage Osmotique** | $\Phi_{j \to i} = \min(\kappa_{\text{max}} B_j, \kappa_{ji}(P_i - P_j))$ | Équilibrage décentralisé avec plafond donateur ($\kappa_{\text{max}} = 0.20$) | `genos-mycelium::osmotic` / `genos_mycelial_osmotic_route` |
| **Stigmergie à 4 Composantes** | $\partial_t C = D \nabla^2 C - \lambda C + \rho \delta$ | Navigation décentralisée, évitement d'anomalies, caste primer | `genos-stigmergy` / `genos_stigmergy_{deposit,sense}` |
| **Morphogenèse de Turing** | Gierer-Meinhardt ($\sigma_v > 0, \epsilon_v$) + Borne CFL | Émergence spontanée de leaders et subordonnés stables | `genos-morpho::turing` |
| **Drapeau Français (Wolpert)** | Seuil sur information positionnelle $[M](x)$ | Différenciation en castes : Architecte / Implémenteur / QA | `genos-morpho::french_flag` / `genos_morpho_differentiate` |
| **Plasticité STDP** | $\Delta W(\Delta t)$ causal $\Delta t \ge 0$, rétro $\Delta t < 0$ | Renforcement causal des liens dans le graphe de mémoire | `genos-synaptic::stdp` / `genos_synaptic_stdp_update` |
| **Élagage de Sommeil & Scaling** | $W_{ij} \leftarrow W_{ij}(\mathcal{A}_{\text{target}}/\max(\epsilon, \bar{a}_i))^\gamma$ | Scaling Turrigiano et élagage homéostatique de graphe | `genos-synaptic::scaling` / `genos_synaptic_prune_scale` |

---

