# La Sociabilité et l'Écologie (Dynamique de Population)

Griot n'est pas forcément seul. GenOS permet de déployer de véritables nuées (swarms) d'agents.

## 1. Quorum Sensing
Comme les bactéries, les agents peuvent attendre d'atteindre un certain seuil de population (Quorum) avant de déclencher une action coûteuse (ex: un refactoring géant). Cela permet de ne pas gaspiller de tokens ou de CPU si la force de frappe est insuffisante.
* **Outil MCP** : `genos_biomimicry_network_quorum`

## 2. Flocking (Comportement de Nuée)
Si un agent "éclaireur" trouve une solution intéressante (ex: un bug critique dans la couche API), les autres agents utilisent le Flocking (comme les oiseaux) pour aligner leur vecteur de recherche et converger vers cette zone.
* **Outil MCP** : `genos_biomimicry_flocking_explore`
