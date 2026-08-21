# Biomimétisme & Stigmergie : Navigation par Gradients Phéromonaux

Ce document détaille l'implémentation de la Stigmergie et des principes biomimétiques appliqués à la topologie spatiale et au routage dans GenOS.

## 1. Topologie Spatiale (`SpatialMesh`)
La grille spatiale est modélisée sous la forme d'un graphe non-orienté où chaque nœud (représentant par exemple un fichier, un AST, ou un module) est connecté à d'autres nœuds.
La topologie de cette grille est maintenue via une liste d'adjacence bidirectionnelle, encapsulée dans la structure `SpatialMesh`. Cela permet une navigation fluide entre les espaces de données par propagation de signaux, à l'image du fonctionnement d'une colonie de fourmis ou d'un essaim.

## 2. Navigation par Gradients Phéromonaux
Les agents GenOS utilisent des "phéromones" (identificateurs de types et concentrations) qu'ils déposent sur les nœuds de la grille. Ces phéromones servent de mémoire partagée asynchrone (Stigmergie), évitant la coordination centrale complexe.

Deux processus physiques régissent la concentration spatio-temporelle de ces phéromones :
*   **Évaporation** : Les informations obsolètes disparaissent naturellement suivant une courbe de décroissance exponentielle continue (`C(t+1) = C(t) * e^(-rate)`). Cela garantit que la grille de connaissances ne soit pas saturée par du bruit résiduel.
*   **Diffusion (Loi de Fick)** : Le signal phéromonal se propage dans le réseau selon un Laplacien discret de graphe. Plus un nœud présente une concentration élevée par rapport à ses voisins, plus le signal se diffusera vers eux. Cela crée des chemins de gradients qui orientent naturellement les requêtes des agents vers les zones denses en information.

## 3. Osmose Réseau et Loi de Hagen-Poiseuille
Au-delà de la diffusion de l'information, le mouvement dirigé d'agents ou de paquets s'effectue via un routage osmotique.
L'implémentation s'appuie sur une loi de Hagen-Poiseuille modifiée, où le flux de données ou le mouvement d'un agent d'un nœud source vers un nœud cible est proportionnel à la différence de gradient (delta de concentration phéromonale) sur un arc, divisée par une résistance virtuelle.
Ce principe favorise un équilibrage de charge "organique" et naturel à travers tout le réseau GenOS, rendant l'architecture extrêmement robuste et résiliente face à la perturbation de liens.
