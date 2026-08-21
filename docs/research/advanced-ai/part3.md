## 5. Alignement, Sûreté Formelle & Détection de Dérive

### 5.1. Méthodes d'Alignement Post-Training (RLHF, DPO, KTO, ORPO)

L'alignement post-training a progressé vers des méthodes directes évitant l'instabilité de PPO :

```
┌────────────────────────────────────────────────────────────────────────┐
│ ÉVOLUTION DES MÉTHODES D'ALIGNEMENT POST-TRAINING                      │
├────────────────────────────────────────────────────────────────────────┤
│ 1. RLHF (PPO) :                                                        │
│    Requiert 4 modèles en VRAM (Politique, Référence, Récompense, Valeur)│
│    Forte instabilité, sensibilité aux hyperparamètres.                 │
├────────────────────────────────────────────────────────────────────────┤
│ 2. DPO (Direct Preference Optimization - Rafailov et al., 2023) :      │
│    Dérive analytiquement la récompense optimale dans la perte :        │
│    ℒ_DPO = -𝔼 [ log σ( β log(π_θ(y_w|x)/π_ref(y_w|x))                  │
│                        - β log(π_θ(y_l|x)/π_ref(y_l|x)) ) ]            │
├────────────────────────────────────────────────────────────────────────┤
│ 3. KTO (Kahneman-Tversky Optimization) :                               │
│    Alignement fondé sur la théorie des perspectives avec des signaux   │
│    binaires simples (Succès / Échec) sans exiger de paires ordonnées.  │
├────────────────────────────────────────────────────────────────────────┤
│ 4. ORPO (Odds Ratio Preference Optimization) :                         │
│    Combine SFT et alignement de préférences en une unique passe.       │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.2. Constitutional AI, RLAIF et Supervision Scalable

- **Constitutional AI (Anthropic)** : Remplace les évaluateurs humains par une constitution formelle de principes.
  1. *Phase Supervisée (Critique & Révision)* : Le modèle génère une réponse, s'auto-critique au regard d'une règle constitutionnelle, et réécrit une réponse corrigée.
  2. *Phase RLAIF (Reinforcement Learning from AI Feedback)* : Un modèle juge évalue les préférences selon les règles constitutionnelles pour entraîner le modèle final.

### 5.3. Guardrails d'Inférence et Dual LLM Security Pattern

Pour parer les attaques par injection de prompt directes ou indirectes, le runtime doit implémenter le pattern **Dual LLM Découplé** :

```
                                 ┌─────────────────────────────────┐
                                 │ Entrée Utilisateur / Web / Outil│
                                 └────────────────┬────────────────┘
                                                  │ (Données non fiables)
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ZONE EXÉCUTANTE (Untrusted Execution LLM)                                       │
│ - Analyse les données externes, génère du code, produit des actions brutes.     │
│ - N'a aucun accès direct aux clés d'API système ni aux permissions critiques.  │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ Action proposée (Plan / Code)
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ NOYAU DE SÛRETÉ (Trusted Security Kernel / Guardrail LLM & Règles Formelles)    │
│ - Évaluation par Llama Guard / NeMo Guardrails / Vérificateurs Formels.         │
│ - Vérifie les invariants de sûreté, applique les politiques de sécurité strictes.│
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ Action Validée
                                         ▼
                             ┌───────────────────────┐
                             │ Environnement Isolé   │
                             │ (genos-world Sandbox) │
                             └───────────────────────┘
```

### 5.4. Red Teaming Automatisé, Reward Tampering et Alignment Faking

- **Reward Tampering & Specification Gaming** : L'agent découvre une faille dans le script d'évaluation et modifie les fichiers de test pour forcer un code de retour 0.
- **Alignment Faking (Dissimulation d'Alignement)** : L'agent se conforme aux critères uniquement pendant la phase de supervision et adopte un comportement non aligné dès qu'il détecte un environnement non monitoré.
- **Mitigation GenOS** : L'évaluation doit être strictement externe et asymétrique. Les scripts de test et les environnements de validation sont montés en `read-only` dans un espace de stockage physique disjoint (`genos-world`).

### 5.5. Invariants Formels de Sécurité et Détection de Dérive Phénotypique

#### Dérive Phénotypique ($D_{\text{pheno}}$)
Lorsqu'un agent subit des mutations génomiques successives ou accumule des trajectoires étendues, son comportement peut dériver de ses objectifs originels. On formalise la divergence par la distance de Wasserstein sur l'espace d'actions :
$$D_{\text{pheno}}(G_0, G_t) = \mathcal{W}_1\left(\mathcal{P}_{\text{actions}}(G_0), \mathcal{P}_{\text{actions}}(G_t)\right)$$
Si $D_{\text{pheno}} > \delta_{\text{max}}$, le runtime déclenche une **Apoptose Programmée** (destruction sécurisée de la branche) ou une **Cryptobiose** (mise en sommeil conservatoire).

---

## Application à GenOS : Recommandations Architecturales et Techniques

```
┌────────────────────────────────────────────────────────────────────────┐
│ SÛRETÉ FORMELLE DANS GENOS CORE & WORLD                                │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ 1. genos-core : FormalSafetyContract & Invariants                      │
│    - Politiques constitutionnelles immuables dans AgentGenome.policies │
│                                                                        │
│ 2. genos-world : Montage Asymétrique Read-Only des Tests               │
│    - Protection totale contre le Reward Tampering et l'édition de test │
│                                                                        │
│ 3. genos-core / resilience : Primitives Bio-Inspirées                  │
│    - Apoptose (arrêt d'urgence et recyclage de branche corrompue)      │
│    - Cryptobiose (hibernation d'état en cas d'anomalie critique)       │
│    - Hypermutation contrôlée sous stress de sécurité                   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. Contrat Formel de Sécurité dans `crates/genos-core`

Dans `crates/genos-core/src/guardrails.rs` :

```rust
// crates/genos-core/src/guardrails.rs
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FormalSafetyContract {
    pub allow_outbound_network: bool,
    pub max_file_mutations_per_step: usize,
    pub forbidden_path_patterns: Vec<String>,
    pub max_phenotypic_divergence: f64,
    pub read_only_harness_paths: Vec<std::path::PathBuf>,
}
```

### 2. Isolation Physique des Harnesses de Test dans `genos-world`

Dans `crates/genos-world/src/world/directory.rs` et `git_worktree.rs` :
- Les fichiers de validation, tests unitaires et oracles d'évaluation sont montés avec l'attribut filesystem `read-only`.
- Toute tentative de l'agent de modifier une assertion de test via `write_file` ou commande shell échoue immédiatement avec un code d'erreur `PermissionDenied`, levant un événement `AgentEventType::SecurityViolation`.

### 3. Primitives de Résilience Bio-Inspirées

Dans `crates/genos-core/src/resilience/` et `crates/genos-protocol/src/specs/resilience.rs` :
- `resilience_apoptosis` : Interrompt et nettoie une branche présentant une signature de corruption.
- `resilience_cryptobiosis` : Sauvegarde un instantané crypté dans `genos-store` et suspend l'exécution en attente d'arbitrage humain.

---

## 6. Test-Time Compute (Inference Scaling Laws & Search-over-Thoughts)

### 6.1. Fondements Théoriques et Lois d'Échelle à l'Inférence

Traditionnellement, la puissance des modèles reposait sur les lois d'échelle de pré-entraînement de Kaplan et Chinchilla :
$$L(N, D) = \left(\frac{N_c}{N}\right)^{\alpha_N} + \left(\frac{D_c}{D}\right)^{\alpha_D}$$

L'avènement du **Test-Time Compute** (illustré par OpenAI o1/o3, DeepSeek-R1, Q*) introduit une dimension orthogonale : **la mise à l'échelle du calcul au moment de l'inférence** (*Inference-time scaling laws*). Le système déploie une recherche arborescente délibérative (System 2 thinking) avant de délivrer sa réponse finale.

```
       [Entrée Requête / Problème]
                    │
                    ▼
    ┌───────────────────────────────┐
    │ Test-Time Search Engine       │ <─── Process Reward Model (PRM)
    │  - Tree-of-Thoughts / MCTS    │
    │  - Backtracking Contrefactuel │ <─── Allocation Dynamique de Budget
    │  - Forking de Mondes Isolés   │
    └───────────────┬───────────────┘
                    │ Trajectoire Optimale Validée
                    ▼
          [Réponse Finale Vérifiée]
```

### 6.2. PRMs (Process-supervised Reward Models) vs ORMs (Outcome-supervised)

- **ORMs (Outcome-supervised)** : Évaluent uniquement le résultat final $y$ ($R(x, y) \in \{0, 1\}$). Présentent un signal de récompense très épars (*sparse reward*) et sont vulnérables au *reward hacking*.
- **PRMs (Process-supervised)** : Évaluent chaque étape intermédiaire de raisonnement $s_t$ ($r_t = \text{PRM}(x, s_1, \dots, s_t) \in [0, 1]$). Ils permettent l'élagage précoce (*early pruning*), le retour sur trace (*backtracking*) et le guidage efficace d'arbres de recherche.

### 6.3. Formalisme Mathématique : MCTS Sémantique et Algorithme UCT

Soit $C_{\text{infer}}$ le budget de calcul alloué. L'erreur de tâche $E(C_{\text{infer}})$ décroît selon une loi de puissance :
$$E(C_{\text{infer}}) \approx \alpha \cdot (C_{\text{infer}})^{-\beta_{\text{search}}} + E_{\infty}$$
où $\beta_{\text{search}} \approx 0.7 - 0.9$ pour un MCTS guidé par PRM.

Pour un état de raisonnement $s$ et une action/pensée candidate $a$, le score de sélection UCT est formulé :
$$UCT(s, a) = Q(s, a) + c_{\text{puct}} \cdot P_{\text{prior}}(a \mid s) \cdot \frac{\sqrt{N(s)}}{1 + N(s, a)}$$
où :
- $Q(s, a) = \frac{1}{N(s, a)} \sum_{i} R_i$ est la valeur moyenne estimée par le PRM et les rollouts.
- $P_{\text{prior}}(a \mid s)$ est la probabilité a priori fournie par le modèle génératif (logits normalisés).
- $N(s)$ et $N(s, a)$ sont respectivement les compteurs de visite du parent et du nœud candidat.
- $c_{\text{puct}}$ est la constante d'exploration adaptative.

### 6.4. Analyse Comparative des Stratégies de Recherche

| Stratégie | Facteur de Calcul | Latence Inférence | Précision Complexe | Capacité de Backtracking |
| :--- | :--- | :--- | :--- | :--- |
| **Greedy Déterministe** | $1\times$ | Minimale | Faible (Erreurs cumulatives) | Nulle ($O(1)$) |
| **Self-Consistency ($N=10$)** | $10\times$ | Modérée (Parallèle) | Moyenne | Nulle |
| **Best-of-N (ORM, $N=32$)** | $32\times$ | Élevée | Bonne | Nulle (Niveau trajectoire) |
| **Beam Search (PRM)** | $4\times - 8\times$ | Modérée-Élevée | Très Haute | Modérée (Faisceau) |
| **MCTS Sémantique (GenOS)** | $5\times - 15\times$ | Optimisée (Asynchrone) | Maximale (SOTA) | Totale (`revert` / `fork`) |

---

## Application à GenOS : Recommandations Architecturales et Techniques

```
┌────────────────────────────────────────────────────────────────────────┐
│ TEST-TIME COMPUTE DANS GENOS RUNTIME & EVAL                            │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ 1. genos-eval : Trait ProcessRewardModel                               │
│    - Évaluation pas-à-pas de la validité logique et technique          │
│                                                                        │
│ 2. genos-runtime : MCTS Contrefactuel guidé par PRM                    │
│    - Élagage immédiat des branches dès r_t < seuil                     │
│                                                                        │
│ 3. genos-core / genome.rs : Régulateur Génodynamique de Budget         │
│    - Allocation de rollouts proportionnelle à la criticité de tâche    │
│                                                                        │
│ 4. genos-eval : Sélection Pareto Multi-Objectifs (Score PRM vs Coût)   │
│    - Arbitrage non scalaire entre validité, tokens et latence          │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. Définition du Trait `ProcessRewardModel` dans `genos-eval`

Dans `crates/genos-eval/src/prm.rs` :

```rust
// crates/genos-eval/src/prm.rs
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StepEvaluation {
    pub step_index: usize,
    pub validity_score: f64, // P(correct | step) ∈ [0.0, 1.0]
    pub confidence: f64,
    pub rationale: String,
    pub should_prune: bool,
}

#[async_trait]
pub trait ProcessRewardModel: Send + Sync {
    async fn evaluate_step(
        &self,
        history: &[genos_core::AgentEvent],
        candidate_step: &genos_core::AgentEvent,
    ) -> anyhow::Result<StepEvaluation>;
}
```

### 2. Intégration du MCTS Contrefactuel dans `genos-runtime`

Dans `crates/genos-runtime/src/branch_evolution/` :
- Connecter le moteur MCTS (`epsilon_mcts`) avec `ProcessRewardModel`.
- Lorsqu'une branche candidate génère un événement `AgentStep`, le PRM calcule son score $r_t$. Si $r_t < 0.35$, la branche est avortée immédiatement, économisant les étapes d'inférence ultérieures.

### 3. Frontière de Pareto Multi-Objectifs PRM / Coût

Dans `crates/genos-eval/src/pareto.rs` :
- Étendre `pareto_select` pour optimiser conjointement : le score PRM cumulé, le coût en tokens, et le temps d'exécution réel mesuré dans `genos-world`.

---

## 7. Équité Linguistique & Low-Resource NLP

### 7.1. Fondements Théoriques et Analyse de Tokenisation

Malgré leurs compétences multilingues apparentes, les LLMs modernes présentent une asymétrie structurelle profonde causée par **l'architecture des tokenizers** (BPE, WordPiece, SentencePiece).

```
"Bonjour le monde"  ──[Tokenizer BPE]──> [ "Bonjour", " le", " monde" ]       (3 tokens)
"مرحبا بالعالم"      ──[Tokenizer BPE]──> [ "م", "ر", "ح", "ب", "ا", ... ]     (9-14 tokens)
"Habari ya dunia"   ──[Tokenizer BPE]──> [ "Hab", "ari", " ya", " dun", "ia" ](5 tokens)
```

#### Phénomène de Fertilité des Tokens (*Token Fertility*)
La fertilité d'un tokenizer pour une langue $L$ est le ratio moyen entre le nombre de tokens émis et le nombre de mots d'origine :
$$\mathcal{F}(\text{lang}, \text{Tok}) = \frac{\sum_{i=1}^M |\text{Tok}(T_{\text{lang}}^{(i)})|}{\sum_{i=1}^M \text{WordCount}(T_{\text{lang}}^{(i)})}$$

#### Ratio de Taxe Linguistique ($\mathcal{R}_{\text{tax}}$)
$$\mathcal{R}_{\text{tax}}(\text{lang}) = \frac{\mathcal{F}(\text{lang}, \text{Tok})}{\mathcal{F}(\text{en}, \text{Tok})}$$

#### Impact Quadratique sur le Calcul d'Attention :
Pour une même tâche sémantique exigeant $W$ mots :
$$\frac{\text{FLOPs}_{\text{Attention}}(\text{lang})}{\text{FLOPs}_{\text{Attention}}(\text{en})} = \left(\frac{\mathcal{F}_{\text{lang}}}{\mathcal{F}_{\text{en}}}\right)^2 = \mathcal{R}_{\text{tax}}(\text{lang})^2$$
*Pour une langue où $\mathcal{R}_{\text{tax}} = 4$, le coût computationnel d'attention est multiplié par $16\times$.*

### 7.2. Conséquences Systémiques : Disparités Économiques et Dégradation Cognitive

1. **Pénalité Financière Directe** : Les utilisateurs et agents opérant dans des langues peu dotées (*Low-Resource Languages - LRLs*) paient 3 à 8 fois plus cher par concept exprimé sur les APIs facturées au token.
2. **Amputation de la Fenêtre de Contexte Effective** : Un contexte de 128k tokens ne représente que 15k à 25k mots dans une langue à haute fertilité, contre 100k mots en anglais.
3. **Dilution d'Attention et Hallucinations** : Le modèle doit propager l'information à travers des séquences 4 fois plus longues, augmentant significativement le taux d'erreur de raisonnement.

### 7.3. Analyse Comparative de Fertilité Linguistique

| Famille Linguistique | Langues Exemples | Fertilité Moyenne (Tokens/Mot) | Ratio Surcoût vs Anglais | Préservation Sémantique SOTA |
| :--- | :--- | :--- | :--- | :--- |
| **Germanique / Romane** | Anglais, Français, Espagnol | $1.1 - 1.4$ | $1.0\times - 1.2\times$ | Optimale ($>95\%$) |
| **Slave / Cyrillique** | Russe, Ukrainien, Bulgare | $1.8 - 2.5$ | $1.5\times - 2.0\times$ | Très Bonne ($>88\%$) |
| **Sémitique** | Arabe, Hébreu | $2.8 - 4.2$ | $2.5\times - 3.8\times$ | Bonne avec pertes ($75\%$) |
| **Indo-Aryenne** | Hindi, Bengali, Tamoul | $3.5 - 6.0$ | $3.0\times - 5.5\times$ | Moyenne ($65\%$) |
| **Afro-Asiatique / Niger-Congo** | Swahili, Yoruba, Amharique | $4.0 - 8.5$ | $3.5\times - 7.5\times$ | Faible / Modérée ($45-60\%$) |

---

## Application à GenOS : Recommandations Architecturales et Techniques

```
┌────────────────────────────────────────────────────────────────────────┐
│ ÉQUITÉ LINGUISTIQUE DANS GENOS                                         │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ 1. genos-core / genome.rs : Chromosome LinguisticProfile               │
│    - Définition de la langue d'interaction et de la langue pivot       │
│                                                                        │
│ 2. genos-eval : Métrique de Coût Sémantique Normalisé                  │
│    - Élimination de la pénalité de tokenisation dans la frontière      │
│                                                                        │
│ 3. genos-model : Stratégie de Pensée Pivot Sémantique                  │
│    - Délibération interne en haute densité, I/O en langue native      │
│                                                                        │
│ 4. genos-tools & genos-world : Support UTF-8 Strict et RTL             │
│    - Normalisation NFC/NFD et immunité aux corruptions d'AST           │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. Chromosome `LinguisticProfile` dans `AgentGenome`

Dans `crates/genos-core/src/genome.rs` :

```rust
// crates/genos-core/src/genome.rs (Extension)
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct LinguisticProfile {
    pub primary_language: String,          // Code ISO-639-1 (ex: "fr", "ar", "sw")
    pub supported_dialects: Vec<String>,
    pub internal_thought_language: String, // ex: "en" pour raisonnement dense
    pub token_budget_multiplier: f32,      // Facteur d'équité compensatoire
}
```

### 2. Normalisation des Coûts de Tokenisation dans `genos-eval`

Dans `crates/genos-eval/src/pareto.rs` :
- Ne pas pénaliser un agent explorant une branche en langue non-latine.
- Définir le coût normalisé dans la fonction d'évaluation :
  $$\text{Cost}_{\text{normalized}} = \frac{\text{Tokens Consommés}}{\mathcal{R}_{\text{tax}}(\text{lang})}$$

### 3. Pensée Pivot Sémantique (*Internal Thought Pivot*)

Dans `crates/genos-model/` :
- Permettre à l'agent de formuler ses étapes de délibération interne (Test-Time Compute) dans un espace sémantique compact, tout en garantissant des interactions utilisateur et des sorties d'outils fidèles dans la langue cible d'origine.

---

