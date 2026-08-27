> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Documentation de l'Architecture GenOS v2.0 - EPIC 3 & 6

## 1. Routage Entropique Adaptatif (EPIC 3)
Le moteur de routage (`ModelRouter`) implémente un paradigme d'allocation dynamique des ressources de calcul. Au lieu de s'appuyer systématiquement sur des modèles de langage lourds (Frontier Models), le système :
1. **Évalue la requête** initialement à travers un modèle léger et rapide (SLM, e.g., via `CandleEngine`).
2. **Mesure l'entropie sémantique** (indice d'incertitude) de la génération produite par le SLM.
3. **Escalade (Fallback)** vers le modèle Frontier (Tier 2) si, et seulement si, l'entropie dépasse un seuil de sécurité (`entropy_threshold`).

Cette approche, inspirée du métabolisme cellulaire, garantit une consommation optimale des ressources (ATP virtuel) tout en assurant une haute précision sur les tâches complexes.

## 2. Auto-Évolution et Génétique Lamarckienne (EPIC 6)
Le module `LamarckianFinetuner` modélise le paradigme d'évolution adaptative de GenOS en s'inspirant de processus biomimétiques avancés :
- **Optimisation DPO** : Intégration de trajectoires validées pour muter et fine-tuner le comportement et les hyperparamètres de l'AgentGenome.
- **Transfert Horizontal de Gènes (Plasmides MCP)** : Un agent peut absorber de nouvelles compétences, connaissances ou schémas d'outils de façon instantanée et à chaud (`trigger_horizontal_transfer` et `absorb_plasmid`).
- **Réponse SOS Génomique** : Face à des stress métaboliques extrêmes ou des échecs répétés, l'agent déclenche une hypermutation dirigée (`evaluate_stress_and_mutate`) pour s'extirper des impasses et explorer de nouvelles heuristiques.

Ces mécanismes offrent une plasticité structurelle unique, rompant la dépendance stricte aux données de pré-entraînement humain et garantissant la viabilité de l'écosystème multi-agents.
