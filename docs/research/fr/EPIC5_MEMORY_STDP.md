> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Architecture de la Mémoire GenOS v2.0 (EPIC 5)

Ce document décrit la refonte fondamentale du sous-système de mémoire agentique de GenOS, introduisant l'empreinte mémoire $O(1)$ par Copy-on-Write (CoW) et la plasticité synaptique (STDP).

## 1. Mémorisation O(1) et Copy-on-Write (CoW)
L'explosion combinatoire des mondes contrefactuels (MCTS) saturait la VRAM. La nouvelle approche déstructure `AgentSnapshot` :
- **SnapshotComponentManifest** : Un manifeste léger qui référence les composants massifs (Génome, État) via des empreintes SHA-256 (`CasHash`).
- **CasStore** : Le moteur de stockage (dans `genos-store`) indexe physiquement les données par leur contenu. Si mille branches partagent la même mémoire sémantique, le coût de stockage est rigoureusement de 1.
- **Cryptobiose (Zstd)** : Lors de la suspension (sommeil profond) de l'agent, la mémoire volatile est purgée et l'état vital est compressé avec l'algorithme `Zstandard`, produisant une `CryptobioticSpore` ultra-dense avec racine de Merkle.

## 2. Plasticité Synaptique STDP et Scaling de Turrigiano
Les agents IA traditionnels concatènent indéfiniment les faits dans la fenêtre de contexte ("context stuffing"), menant à l'amnésie et aux hallucinations. GenOS résout cela via le crate dédié `genos-synaptic` :
- **Graphe STDP (Spike-Timing Dependent Plasticity)** : Les liaisons entre les concepts mémorisés sont renforcées si elles sont chronologiquement causales, et atténuées dans le cas contraire. L'agent "apprend" à associer ce qui a logiquement fonctionné. 
- **Modélisation Structurée (Chemin Synaptique)** : Chaque connexion est modélisée par le `SynapticPath` à 3 niveaux : *Transient*, *DynamicLTP*, et *PhysicalTrace* (voir [36_Synaptic_Path.md](../concepts/36_Synaptic_Path.md)), reproduisant fidèlement l'ancrage progressif de la mémoire.
- **Élagage de Phase de Sommeil (Pruning)** : Lors du cycle de repos métabolique, les liaisons inférieures à un seuil critique (`prune_threshold`) subissent un affaiblissement (*decay*) et sont physiquement effacées du graphe si elles perdent leur trace physique.
- **Scaling Homéostatique (Turrigiano)** : Une normalisation multiplicative régule l'attention synaptique. Cela empêche l'apparition de "Nœuds Hubs" (concepts répétitifs) qui accapareraient toute l'attention du LLM lors du rappel vectoriel.

## 3. Condensation Chromatinienne
En complément de la plasticité synaptique, les capacités génomiques inactives sont vectorisées et "mises sous silence" (Hétérochromatine). Elles sont masquées du *prefill* LLM (réduction constatée de 75%), mais restent instantanément réactivables en mémoire $O(1)$ dès qu'un stimulus environnemental pertinent l'exige.
