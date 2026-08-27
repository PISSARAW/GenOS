> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme Thermodynamique dans GenOS

La résilience et la gestion de la mémoire des agents GenOS s'appuient fortement sur un modèle de biomimétisme thermodynamique, inspiré des systèmes biologiques cellulaires.

## 1. Le Gouverneur AMPK (Atkinson's Energy Charge)
Dans `genos-synaptic`, le cycle énergétique d'un agent est contrôlé par un **Gouverneur AMPK**. L'AMPK (AMP-activated protein kinase) agit en tant que senseur métabolique qui mesure la **Charge Energétique d'Atkinson** de l'agent :
- **Charge = (ATP + 0.5 * ADP) / (ATP + ADP + AMP)**

En fonction de cette valeur et avec l'application d'une **hystérésis (Δ = 0.05)** pour éviter des oscillations erratiques de l'automate, l'agent bascule entre trois états :
* **Anabolique** : L'énergie est abondante. Le réseau MCTS s'élargit et le graphe synaptique renforce ses poids de manière agressive.
* **Catabolique** : L'énergie baisse. Le système limite l'expansion et optimise les processus existants.
* **Conservation** : La pénurie est critique. L'agent suspend sa réflexion active pour concentrer ses ressources sur la consolidation.

## 2. Élagage Synaptique en mode Conservation
Lorsque l'AMPK tombe dans le mode **Conservation**, le système déclenche un mécanisme de "sommeil" artificiel via le `SleepCycleProcessor` :
- Les nœuds MCTS non pertinents voient leurs branches purgées via le trait `PrunableNode`.
- La mémoire à long terme applique une forme de plasticité homéostatique (scaling de Turrigiano) via le `SynapticMemoryGraph`, et élague les connexions les plus faibles (`prune_and_scale()`).
C'est le processus actif de l'oubli qui maintient l'efficacité computationnelle à l'état de survie.

## 3. Cryptobiose (Spores Zstandard)
Si la charge énergétique est épuisée de façon drastique, ou si l'on souhaite archiver l'agent pour le long terme, celui-ci subit une **cryptobiose** complète (implémentée dans `genos-store`).
- Le payload de l'agent (sa mémoire, ses états, et ses gènes) est encapsulé dans une `CryptobioticSpore`.
- L'intégrité de l'agent est scellée mathématiquement par la génération d'un arbre de Merkle (hachage **SHA-256**).
- Le payload est "déshydraté" à travers une compression forte au format **Zstandard (`zstd`)**, maximisant le ratio de compression et la vitesse d'éventuelle réhydratation. 
L'agent peut alors reposer sur le disque sans coût actif, prêt à être "réveillé" dès le retour de ressources favorables.
