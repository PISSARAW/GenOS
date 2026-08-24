# GenOS v2.0 - Product Backlog

Ce backlog structure les recommandations d'architecture avancée issues des recherches fondamentales (Anti-hallucination, RAG Moderne, Test-Time Compute, Sûreté Formelle).

## EPIC 1 : Sécurité "Zero Trust" & Tool Gateway
*Objectif : Isoler l'exécution des outils, empêcher les prompt injections et les actions malveillantes autonomes.*

- **US 1.1 - PermissionsManifest** : En tant que `genos-runtime`, je veux qu'un `PermissionsManifest` soit attaché à chaque agent pour définir strictement ses droits d'accès au système de fichiers et au réseau.
- **US 1.2 - Intercepteur ToolGateway** : En tant qu'orchestrateur, je veux que chaque `ToolCallRequest` soit interceptée et formellement validée contre le `PolicyPlane` avant son exécution réelle.
- **US 1.3 - SecureToolOutput & Taint Tracking** : En tant que `genos-tools`, je veux marquer toutes les données retournées par des commandes externes ou du web avec l'attribut `is_tainted` pour éviter que le modèle ne confonde ces données avec ses instructions système.
- **US 1.4 - Sandboxing Read-Only des Tests** : En tant que `genos-world`, je veux monter les harnais de tests et oracles en "Read-Only" pour empêcher l'agent de tricher et de modifier ses propres examinateurs (*Reward Tampering*).

## EPIC 2 : Test-Time Compute & Raisonnement Arborescent
*Objectif : Basculer d'une exécution linéaire à une prise de décision arborescente contrefactuelle (MCTS).*

- **US 2.1 - Process Reward Model (PRM)** : En tant que `genos-eval`, je veux un trait `ProcessRewardModel` capable d'évaluer la validité intermédiaire de chaque étape de pensée d'un agent.
- **US 2.2 - MCTS Sémantique avec AgentSnapshot** : En tant que `genos-runtime`, je veux que l'agent utilise un algorithme MCTS, où chaque nœud est un `AgentSnapshot`, pour explorer plusieurs hypothèses simultanément.
- **US 2.3 - Élagage Précoce (Early Pruning)** : En tant que moteur de recherche, je veux avorter immédiatement les branches (`fork`) de raisonnement dont le score intermédiaire PRM est inférieur au seuil de viabilité.
- **US 2.4 - ImpossibleBench** : En tant que `genos-eval`, je veux une suite de tests impossibles à résoudre pour m'assurer que l'agent préfère l'abstention (`ActiveRefusal`) plutôt que l'hallucination.

## EPIC 3 : Routage Dynamique de Modèles & SLM
*Objectif : Optimiser drastiquement les coûts et la latence en exécutant localement les tâches simples et en réservant les modèles lourds aux raisonnements complexes.*

- **US 3.1 - Moteur Inférence Local (Candle)** : En tant que `genos-model`, je veux intégrer le backend Rust natif `Candle` pour faire tourner des SLMs (1B-8B) quantifiés en local.
- **US 3.2 - Routage Adaptatif de Complexité** : En tant qu'orchestrateur, je veux router les tâches de vérification de schéma et de triage vers le SLM local (Tier 0).
- **US 3.3 - Escalade par Entropie Sémantique** : En tant que `ModelRouter`, je veux basculer l'inférence vers un Frontier Model (Tier 2) si l'entropie sémantique (incertitude) calculée par le SLM dépasse le seuil critique.

## EPIC 4 : Consensus d'Essaim (Swarm Intelligence)
*Objectif : Construire une intelligence collective robuste face aux hallucinations.*

- **US 4.1 - Consensus de Brier (Brier Quorum)** : En tant que comité d'agents (`DistributedHuddle`), je veux que la pondération du vote de chaque agent sur une hypothèse soit inversement proportionnelle à son erreur de calibration historique.
- **US 4.2 - Échange de Croyances Typées** : En tant que swarm, je veux échanger des structures `VerifiedBelief` possédant une provenance cryptographique forte (`ExecutionReceipt`).

## EPIC 5 : Optimisation de Mémoire & Forking $O(1)$
*Objectif : Permettre la création instantanée de milliers de mondes contrefactuels sans saturer la VRAM.*

- **US 5.1 - Copy-on-Write (CoW) Snapshots** : En tant que `genos-store`, je veux que chaque composant mémoire d'un `SnapshotComponentManifest` soit adressé par son hash SHA-256 (CAS), pour un partage 100% sans duplication.
- **US 5.2 - Backend State Space Model (SSM)** : En tant que `genos-model`, je veux supporter le chargement de modèles hybrides de type Mamba-2 pour bénéficier d'un état caché $O(1)$ de 8Ko, rendant les bifurcations de branches quasi gratuites en mémoire.

## EPIC 6 : Auto-Évolution & Données Synthétiques
*Objectif : Rompre la dépendance aux données humaines (Data Wall) et empêcher le Model Collapse.*

- **US 6.1 - Trajectoires DPO Vérifiables** : En tant que `genos-store`, je veux exporter les paires de trajectoires (Gagnante / Perdante) certifiées par le passage ou l'échec de tests d'environnement réels.
- **US 6.2 - Évolution Lamarckienne** : En tant que `genos-eval`, je veux utiliser ces trajectoires validées pour muter et fine-tuner de façon continue les configurations et comportements du génome (`AgentGenome`).
