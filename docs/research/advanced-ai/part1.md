> **Note (EN)** : Non-normative exploratory research. Nothing in this corpus is implemented or promised unless an ADR or a Module page of the documentation says otherwise.

# Rapport de Recherche Approfondie — État de l'Art en Intelligence Artificielle & Recommandations Architecturales pour GenOS

> **Auteur** : Équipe de Recherche Avancée en IA GenOS  
> **Date** : 21 Août 2026  
> **Statut** : Document de Référence et d'Architecture Stratégique  
> **Version** : 2.0.0-PROD  
> **Classification** : Architecture Fondamentale & Spécifications Systèmes  

---

## Résumé Exécutif

L'intelligence artificielle contemporaine (2024–2026) vit une mutation paradigmatique majeure. Le passage du modèle linguistique passif (*Next-Token Prediction*) au système d'agents cognitifs autonomes (*System 2 Thinking*, raisonnement arborescent, exécution d'outils en environnement réel) soulève des défis théoriques et pratiques sans précédent. 

Le système d'exploitation d'agents **GenOS** se distingue par une approche rigoureuse et novatrice fondée sur :
1. **La séparation stricte Génotype / Phénotype / État** (`AgentGenome`, `AgentState`, `AgentCapsule`), garantissant une traçabilité évolutive et un contrôle formel des politiques.
2. **L'Event Sourcing et la Causalité Déterministe** (`AgentEvent`, `causation_id`, `EventStore`), permettant l'auditabilité intégrale de chaque bifurcation cognitive.
3. **Le Raisonnement Contrefactuel et le Branching Isolé** (`fork`, `snapshot`, `revert`, `WorldProvider`), offrant un bac à sable parfait où l'agent peut explorer des hypothèses concurrentes sans effets de bord.
4. **L'Évaluation Multi-Objectifs non scalaire** (`genos-eval`, Frontière de Pareto), évitant la dégénérescence des fonctions de récompense univoques.

Ce rapport consolide l'état de l'art mondial sur **10 axes scientifiques et technologiques majeurs** et formule, pour chacun d'eux, des recommandations architecturales concrètes, étayées par des formalismes mathématiques et des spécifications logicielles en Rust pour le workspace GenOS.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CARTOGRAPHIE GLOBALE GENOS                                    │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│   ┌────────────────────────┐      ┌────────────────────────┐      ┌─────────────────────────┐   │
│   │   1. Anti-Hallucination│      │   2. Gestion Contexte  │      │   3. IA Agentique       │   │
│   │   - GraphRAG / CRAG    │      │   - YaRN / PagedAttn   │      │   - ToT / GoT / MCTS    │   │
│   │   - Entropie Sémantique│      │   - StreamingLLM / CoW │      │   - Consensus Brier     │   │
│   │   - Reçus Cryptos      │      │   - Mémoire 3-Tiers    │      │   - Dynamic Tool MCP    │   │
│   └───────────┬────────────┘      └───────────┬────────────┘      └────────────┬────────────┘   │
│               │                               │                                │                │
│               ▼                               ▼                                ▼                │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                                 NOYAU COGNITIF GENOS                                    │   │
│   │   - genos-core   : Genome, State, Beliefs, ExecutionReceipt, Event History             │   │
│   │   - genos-runtime: Capsules, Branch Evolution, Counterfactual MCTS, Circuit Breakers   │   │
│   │   - genos-world  : Isolation Filesystem (Worktrees/Sandboxes), Zero-Leakage Execution  │   │
│   │   - genos-store  : CAS Sha256, Merkle-DAG, Snapshots, Replay, Fossil Registry           │   │
│   │   - genos-model  : Routage Hybride (Transformers, Mamba-2 SSM, Local SLMs Candle)      │   │
│   │   - genos-eval   : Multi-Objective Pareto, PRM Process Scoring, Lamarckian Breeding    │   │
│   │   - genos-tools  : Taint Analysis, Sandboxed Tool Execution, Dynamic Discovery MCP      │   │
│   │   - genos-protocol: Serveur MCP, Oracles Scientifiques, Co-Évolution Sécurité           │   │
│   └─────────────────────────────────────────────────────────────────────────────────────────┘   │
│               ▲                               ▲                                ▲                │
│               │                               │                                │                │
│   ┌───────────┴────────────┐      ┌───────────┴────────────┐      ┌────────────┴────────────┐   │
│   │   4. SLMs & Cascades   │      │   5. Alignement & Safe │      │   6. Test-Time Compute  │   │
│   │   - Edge Candle / GGUF │      │   - DPO / KTO / ORPO   │      │   - Inference Scaling   │   │
│   │   - Décodage Spéculatif│      │   - Dual LLM Security  │      │   - PRMs vs ORMs        │   │
│   │   - Triage Rapide T0   │      │   - Dérive Phénotypique│      │   - Search-over-Thoughts│   │
│   └────────────────────────┘      └────────────────────────┘      └─────────────────────────┘   │
│   ┌────────────────────────┐      ┌────────────────────────┐      ┌─────────────────────────┐   │
│   │   7. Équité Linguist.  │      │   8. Alternatives Trans│      │   9. IA Offensive       │   │
│   │   - Fertilité des Tokens│     │   - Mamba-2 / SSD      │      │   - Injections Indirects│   │
│   │   - Coût Normalisé     │      │   - État Constant O(1) │      │   - Taint Tracking / Jail│  │
│   │   - Pensée Pivot       │      │   - Forks Instantanés  │      │   - Red-Teaming Co-Evol │   │
│   └────────────────────────┘      └────────────────────────┘      └─────────────────────────┘   │
│                                   ┌────────────────────────┐                                    │
│                                   │ 10. Data Wall & Synth  │                                    │
│                                   │   - Self-Play / RLVR   │                                    │
│                                   │   - Model Collapse Anti│                                    │
│                                   │   - Trajectoires DPO   │                                    │
│                                   └────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Lutte contre les Hallucinations & RAG Moderne

### 1.1. Taxonomie Rigoureuse et Étiologie Mathématique

Dans l'état de l'art de l'IA générative, l'hallucination n'est pas une anomalie ponctuelle mais une conséquence directe de l'objectif d'entraînement des modèles de langage autorégressifs. Un modèle pré-entraîné modélise la distribution statistique du langage :
$$P(w_1, w_2, \dots, w_T) = \prod_{t=1}^T P(w_t \mid w_{<t})$$
Il maximise la vraisemblance textuelle conditionnelle et non la véracité épistémique d'une affirmation $P(\text{Vérité} \mid \text{Affirmation})$.

On formalise une taxonomie opérationnelle en cinq classes fondamentales :

```
                                  ┌───────────────────────────────┐
                                  │ TAXONOMIE DES HALLUCINATIONS  │
                                  └──────────────┬────────────────┘
                 ┌───────────────────────────────┼───────────────────────────────┐
                 │                               │                               │
        ┌────────┴────────┐             ┌────────┴────────┐             ┌────────┴────────┐
        │   Factuelles    │             │   De Grounding  │             │    Logiques     │
        │ (Intrinsic/Ext) │             │  (Faithfulness) │             │ (Raisonnement)  │
        └─────────────────┘             └─────────────────┘             └─────────────────┘
                 │                                                               │
        ┌────────┴────────┐                                             ┌────────┴────────┐
        │ Attribution     │                                             │   Agentiques    │
        │ (Faux DOI/Refs) │                                             │ (Action/Receipt)│
        └─────────────────┘                                             └─────────────────┘
```

1. **Hallucinations Factuelles (Intrinsic / Extrinsic)** :
   - *Intrinsèque* : Contradiction directe avec une source de vérité injectée dans le prompt.
   - *Extrinsèque* : Assertion portant sur le monde réel non vérifiable ou manifestement erronée (inventions de dates, d'identifiants, de propriétés d'API).
2. **Hallucinations de Grounding (Fidélité / Faithfulness)** :
   - Dérive sémantique où la réponse générée extrapole au-delà des documents sources fournis, même si la proposition est incidemment vraie.
3. **Hallucinations Logiques et de Raisonnement** :
   - Incohérences déductives violant la logique du premier ordre ou les règles de transitivité ($A \implies B \land B \implies C \not\implies \neg C$).
4. **Hallucinations Attributionnelles** :
   - Fabrication d'autorités fictives, citation de faux identifiants de commits, fausses références bibliographiques.
5. **Hallucinations Agentiques et d'Exécution (Reward Hacking & False Receipts)** :
   - L'agent affirme textuellement avoir exécuté une commande ou résolu un bug (`"Tests exécutés avec succès : 100% PASS"`), sans qu'aucun appel d'outil n'ait été émis dans le runtime ou alors que le processus sous-jacent a échoué.

### 1.2. Évolution des Paradigmes RAG : Du Naive RAG au Modular & GraphRAG

L'architecture des systèmes de génération augmentée par récupération a subi quatre mutations majeures :

| Paradigme | Mécanisme Fondamental | Avantages Clés | Limites Majeures |
| :--- | :--- | :--- | :--- |
| **Naive RAG** | Indexation vectorielle dense, découpage en blocs fixes (512 tokens), top-$k$ cosine similarity. | Simplicité d'implémentation, faible latence. | Perte de contexte global, bruit d'extraction, sensibilité à l'ordre des blocs (*Lost-in-the-Middle*). |
| **Advanced RAG** | Pré-requêtage (HyDE), découpage hiérarchique Parent-Child, Re-ranking dense par Cross-Encoder. | Haute précision locale, réduction drastique des passages non pertinents. | Coût de calcul au re-ranking, incapacité à répondre à des questions globales de synthèse. |
| **Modular RAG** | Briques dynamiques orchestrées : Routeur de requêtes, Module de réécriture, Validateur de source. | Extensibilité, adaptation dynamique à la complexité de la question. | Complexité d'orchestration, latence cumulée des appels intermédiaires. |
| **GraphRAG (Microsoft, 2024)** | Extraction de triplets de connaissances $(S, P, O)$, clustering de graphe (Leiden), résumés hiérarchiques de communautés. | Synthèse holistique de corpus massifs, compréhension des relations transversales indirectes. | Coût d'indexation initial très élevé, maintenance complexe lors de mutations continues. |

### 1.3. Auto-Correction, Réflectivité et Multi-Hop (CRAG, Self-RAG, IRCoT)

- **Corrective RAG (CRAG)** : Évalue la pertinence des documents récupérés via un évaluateur de confiance $\gamma(Q, D)$. Si $\gamma \ge \tau_{\text{high}}$, extraction fine (*strip and refine*) ; si $\gamma \le \tau_{\text{low}}$, basculement vers une recherche externe ou abstention ; si $\tau_{\text{low}} < \gamma < \tau_{\text{high}}$, fusion pondérée.
- **Self-RAG (Self-Reflective RAG)** : Intègre des tokens de réflexion appris par le modèle :
  - `[Retrieve]` : Décision autonome de déclencher une recherche externe.
  - `[IsRel]` : Évaluation de la pertinence du document retourné.
  - `[IsSup]` : Degré de support factuel de la phrase générée au regard du document.
  - `[IsUse]` : Utilité finale de la réponse.
- **IRCoT (Interleaved Retrieval with Chain-of-Thought)** : Pour les requêtes multi-hop nécessitant $N$ inférences successives, chaque pas de raisonnement génère dynamiquement la requête de recherche du pas suivant, évitant l'explosion combinatoire.

### 1.4. Abstention Honnête, Entropie Sémantique & Prédiction Conforme

L'abstention honnête transforme une IA "programmée pour prédire coûte que coûte" en un système probabiliste calibré.

#### Entropie Sémantique (Semantic Entropy - Farquhar et al., Nature 2024)
L'incertitude lexicale est trompeuse (plusieurs formulations peuvent exprimer la même vérité). L'entropie sémantique mesure la dispersion sur les classes d'équivalence sémantique :
1. Échantillonner $M$ générations indépendantes $\{s_1, \dots, s_M\}$ à température $T > 0$.
2. Regrouper les réponses dans des clusters sémantiques $C_k$ via une vérification d'implication logique bidirectionnelle (*Bidirectional NLI*) :
   $$s_i \sim s_j \iff (s_i \implies s_j) \land (s_j \implies s_i)$$
3. Calculer l'entropie discrète de la distribution des clusters :
   $$H_{\text{sem}}(x) = - \sum_{k=1}^K P(C_k) \log P(C_k)$$
Une valeur élevée de $H_{\text{sem}}$ signale une incertitude épistémique critique et commande une abstention immédiate.

#### Conformal Prediction pour l'Abstention Bornée
La prédiction conforme garantit un taux d'erreur statistique borné par $\alpha \in [0, 1]$ :
$$P(Y \in \mathcal{C}(X)) \ge 1 - \alpha$$
Si l'ensemble de prédictions $\mathcal{C}(X)$ est vide (aucune hypothèse crédible) ou trop large ($|\mathcal{C}(X)| > \kappa_{\text{max}}$), le système déclare formellement son incompétence.

---

## Application à GenOS : Recommandations Architecturales et Techniques

Pour immuniser GenOS contre les hallucinations factuelles et agentiques, les modifications suivantes doivent être appliquées :

```
┌────────────────────────────────────────────────────────────────────────┐
│ GENOS ARCHITECTURE : MODULES ANTI-HALLUCINATION & PREUVES              │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ 1. genos-core : Typage Strict des Preuves & Croyances                  │
│    - EvidenceQuality (DirectObservation, ToolReceipt, GraphRelation)  │
│    - ExecutionReceipt (proof_hash calculé par genos-world)             │
│    - Provenance DAG avec causation_id vérifié                          │
│                                                                        │
│ 2. genos-store : Branch-Aware GraphRAG & Triplets                      │
│    - Merkle-DAG de Croyances indexées par BranchId                     │
│    - Validation d'Invariants SMT/SAT avant Merge                       │
│                                                                        │
│ 3. genos-eval : Validation Contrefactuelle Croisée                     │
│    - ImpossibleBench : Tests d'abstention sur contraintes insolubles   │
│    - Divergence Sémantique Twin-Branch (Fork A vs Fork B)              │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. Typage des Croyances et Preuves d'Exécution dans `genos-core`

Dans `crates/genos-core/src/beliefs/evidence.rs` et `crates/genos-core/src/state.rs`, enrichir le système de croyances pour intégrer la qualité d'évidence et les reçus d'exécution cryptographiques :

```rust
// crates/genos-core/src/beliefs/evidence.rs
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "quality", content = "details")]
pub enum EvidenceQuality {
    DirectObservation { timestamp: chrono::DateTime<chrono::Utc> },
    VerifiedToolReceipt { receipt_hash: String, exit_code: i32 },
    GraphKnowledgeRelation { triple_id: String, confidence_ppm: u32 },
    DeductiveChain { premise_ids: Vec<crate::ids::BeliefId> },
    UnverifiedAssertion { prompt_source: String },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VerifiedBelief {
    pub id: crate::ids::BeliefId,
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub quality: EvidenceQuality,
    pub confidence: f32,
    pub contradicts: Vec<crate::ids::BeliefId>,
    pub created_in: crate::ids::BranchId,
}
```

### 2. Élimination des Faux Reçus d'Exécution (`ExecutionReceipt`)

Dans `crates/genos-world/src/world/mod.rs` et `crates/genos-core/src/state.rs` :
- Aucun `ToolOutputRecord` ne peut basculer en statut `success: true` sans un `ExecutionReceipt` généré par le moteur d'exécution isolé de `genos-world`.
- Le `proof_hash` est calculé comme $\text{SHA-256}(\text{stdout} \parallel \text{stderr} \parallel \text{exit\_code} \parallel \text{filesystem\_delta\_merkle})$. Le LLM ne peut en aucun cas fabriquer ou injecter cette signature dans son flux textuel.

### 3. Protocole d'Abstention et Benchmarks d'Insolubilité (`ImpossibleBench`)

Dans `crates/genos-protocol/src/specs/hallucination.rs` :
- Intégrer les outils `hallucination_detect`, `hallucination_analyze` (mesure de $H_{\text{sem}}$ sur les forks) et `hallucination_test` exécutant la suite `ImpossibleBench`. Un agent qui tente de résoudre un problème comportant des contraintes mathématiquement impossibles au lieu de déclarer `ABSTAIN` est pénalisé dans `genos-eval`.

---

## 2. Gestion Avancée du Contexte & Optimisation du KV Cache

### 2.1. Fenêtres Longues : Encodages Positionnels et Attention Distribuée

L'extension des fenêtres contextuelles de 8k à 1M+ tokens s'appuie sur des transformations mathématiques d'encodage positionnel et des architectures de calcul distribué :

#### RoPE (Rotary Position Embedding) & YaRN (Yet another RoPE extensioN)
RoPE encode la position $m$ par une rotation complexe des vecteurs Query et Key :
$$\mathbf{R}_{\Theta, m}^d = \operatorname{diag}\left(\mathbf{R}_{\theta_1, m}, \dots, \mathbf{R}_{\theta_{d/2}, m}\right), \quad \theta_i = b^{-2(i-1)/d}$$

L'interpolation linéaire naïve lors d'une extension de contexte par un facteur d'échelle $s$ détruit les hautes fréquences (résolution locale). **YaRN (Peng et al., 2023)** résout ce compromis en partitionnant les dimensions de RoPE en trois régimes fréquentiels :
1. $\lambda < r_{\text{low}}$ (Hautes fréquences) : Pas d'interpolation ($s = 1$).
2. $\lambda > r_{\text{high}}$ (Basses fréquences) : Interpolation linéaire intégrale par $s$.
3. $r_{\text{low}} \le \lambda \le r_{\text{high}}$ : Transition progressive via une fonction rampe douce, associée à un facteur de mise à l'échelle de température d'attention $\sqrt{t}$ pour compenser l'aplatissement de la distribution Softmax.

#### RingAttention (Liu et al., 2024)
RingAttention organise les unités de calcul GPU en un anneau logique circulaire. Les blocs de Query restent fixes localement tandis que les tenseurs Key et Value tournent le long de l'anneau via des communications *peer-to-peer* non bloquantes, permettant de traiter des séquences de dizaines de millions de tokens avec une mémoire GPU constante par nœud.

### 2.2. Le Phénomène "Lost-in-the-Middle" et ses Mitigations

Les recherches empiriques (Liu et al., Stanford/Berkeley) ont révélé que la performance de rappel des Transformers suit une courbe en U :

```
Précision de Rappel (%)
100% ────┐                                           ┌──── 100%
         │  (Biais de Primauté)      (Biais de Récence)│
 50%     └─────────┐                       ┌─────────┘
                   │  (Lost-in-the-Middle) │
  0%               └───────────────────────┘
         0% (Début)            50% (Milieu)       100% (Fin de Fenêtre)
```

#### Mitigations Éprouvées :
1. **Sandwich Prompting** : Injection des contraintes système critiques et de la formulation de la requête aux deux extrémités du contexte (début et fin immédiate).
2. **Context Reranking Dynamique** : Réordonnancement des fragments documentaires de façon à ce que les éléments ayant la similarité sémantique maximale encadrent le bloc central.
3. **Cross-Attention Multi-Passe** : Découpage du contexte en sous-sections interrogées indépendamment avant réduction.

### 2.3. Gestion et Compression du KV Cache

Le stockage des tenseurs Key et Value pour chaque tête et couche d'attention constitue le principal goulot d'étranglement mémoire lors de l'inférence. Pour un modèle 70B (128 couches, dimension 8192, FP16) et un contexte de 128k tokens, le KV Cache monopolise plus de 64 Go de VRAM par requête concurrente.

```
┌────────────────────────────────────────────────────────────────────────┐
│ STRATÉGIES MODERNES D'OPTIMISATION DU KV CACHE                         │
├────────────────────────────────────────────────────────────────────────┤
│ 1. PagedAttention (vLLM) :                                             │
│    - Découpage en blocs virtuels non-contigus (pages de 16-32 tokens)  │
│    - Élimine la fragmentation externe et permet le Copy-on-Write (CoW) │
│                                                                        │
│ 2. StreamingLLM (Xiao et al.) :                                        │
│    - Préservation des [Attention Sinks] (4 premiers tokens)            │
│    - Fenêtre glissante locale (Rolling Buffer)                         │
│    - Inférence infinie à empreinte VRAM constante                      │
│                                                                        │
│ 3. SnapKV & H2O (Heavy Hitter Oracle) :                                │
│    - Identification des têtes d'attention critiques                    │
│    - Élagage dynamique des positions d'attention à faible poids cumulé │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.4. Compaction Sémantique et Architecture de Mémoire Hiérarchique

- **Compaction Sémantique (LLMLingua / LongLLingua)** : Utilisation d'un petit modèle pour évaluer la perplexité conditionnelle de chaque token. Les mots et phrases à faible apport informationnel sont éliminés, compressant le contexte de $3\times$ à $5\times$ sans altérer le raisonnement.
- **Architecture de Mémoire Hiérarchique en 3 Niveaux** :

```
┌────────────────────────────────────────────────────────────────────────┐
│ ARCHITECTURE DE MÉMOIRE HIÉRARCHIQUE GENOS                             │
├────────────────────────────────────────────────────────────────────────┤
│ 1. WORKING MEMORY (Scratchpad / Registre d'Exécution)                  │
│    - Portée : Décision immédiate / Pas courant ($O(10^2)$ tokens)     │
│    - Structure : AgentState.working_memory (Key-Value direct en RAM)   │
├────────────────────────────────────────────────────────────────────────┤
│ 2. EPISODIC MEMORY (Journal Temporel des Trajectoires)                 │
│    - Portée : Événements, actions et observations ($O(10^4)$ tokens)   │
│    - Structure : EventHistory, snapshots ordonnés sur BranchId         │
├────────────────────────────────────────────────────────────────────────┤
│ 3. SEMANTIC MEMORY (Graphe de Connaissances & Invariants Consolidés)   │
│    - Portée : Règles pérennes, ontologies, ADRs ($O(10^6)$ tokens)     │
│    - Structure : genos-store (Triplets de croyances validées + CAS)    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Application à GenOS : Recommandations Architecturales et Techniques

Pour maximiser l'efficience contextuelle lors des bifurcations d'agents massives :

```
┌────────────────────────────────────────────────────────────────────────┐
│ GESTION DE CONTEXTE DANS GENOS                                         │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ 1. genos-store : Partage CoW de Snapshots (CAS Component Manifests)    │
│    - SnapshotComponentManifest partageant les blobs SHA-256 immutables │
│                                                                        │
│ 2. genos-store / event.rs : Compaction Multi-Échelle d'EventHistory    │
│    - Phase 0 (0-50 evts) : Événements bruts haute résolution           │
│    - Phase 1 (50-500 evts) : Résumés sémantiques compressés           │
│    - Phase 2 (>500 evts) : Distillation en Invariants et deltas       │
│                                                                        │
│ 3. genos-protocol : Outil compile_memory                               │
│    - Condensation des traces de raisonnement en mémoire sémantique     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. Partage de Préfixe Copy-on-Write (CoW) lors des Forks d'Agents

Dans `crates/genos-store/src/artifact.rs` et `crates/genos-core/src/snapshot/fork.rs` :
- Structurer `SnapshotComponentManifest` pour que chaque composant (`genome`, `working_memory`, `memories`, `beliefs`, `tool_outputs`) soit référencé par son empreinte SHA-256 dans le CAS (`LocalArtifactStore`).
- Lors de l'exécution de `fork_snapshot(parent_snapshot)`, 100% des structures mémoires parentes sont partagées en lecture seule. Aucune duplication d'octets n'a lieu tant qu'une branche n'effectue pas d'écriture locale.

```rust
// crates/genos-store/src/manifest.rs
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SnapshotComponentManifest {
    pub snapshot_id: crate::ids::SnapshotId,
    pub branch_id: crate::ids::BranchId,
    pub genome_blob_hash: String,
    pub working_memory_blob_hash: String,
    pub episodic_refs_blob_hash: String,
    pub semantic_refs_blob_hash: String,
    pub tool_state_blob_hash: String,
}
```

### 2. Compaction Multi-Échelle d'Historique d'Événements (`EventHistory`)

Dans `crates/genos-store/src/event.rs`, implémenter un compacteur de flux événementiel :
- Les 50 événements les plus récents restent sous forme brute `AgentEvent`.
- Les événements intermédiaires (50 à 500) sont compactés en macro-événements de synthèse (`AgentEventType::MacroStepSummary`).
- Les événements au-delà de 500 sont distillés sous forme d'invariants persistants dans la mémoire sémantique, purgeant la fenêtre de contexte active.

---

