# Stratégies d'Organisation Biomimétiques (Flocking & Hunting)

Ce document décrit les stratégies d'organisation inspirées de la nature implémentées dans GenOS. Ces stratégies permettent de coordonner les agents autonomes de manière efficace, en réduisant la complexité des communications et en optimisant l'utilisation des tokens LLM.

## Concepts Fondamentaux

GenOS intègre plusieurs modèles de comportement collectif :

### 1. Boids (Nuées d'Oiseaux)
Le modèle des Boids (Bird-oid object) simule le comportement de vol en essaim. Il repose sur trois règles simples appliquées localement par chaque agent :
- **Séparation** : Éviter les collisions avec les voisins proches.
- **Alignement** : Aligner sa direction sur celle des voisins.
- **Cohésion** : Se diriger vers le centre de masse des voisins.

Dans GenOS, cela se traduit par des agents qui peuvent explorer un espace de solutions ou de fichiers en maintenant une distance optimale (éviter la redondance) tout en poursuivant un objectif commun.

### 2. Fish School (Bancs de Poissons)
Similaire aux Boids mais souvent optimisé pour l'évasion de prédateurs ou la recherche de nourriture (foraging). Dans le contexte de GenOS, cela s'applique à la recherche d'informations rapides (par exemple, fouiller un large volume de logs ou de code). La transmission d'information (une découverte) se propage comme une onde à travers l'essaim, permettant une réallocation rapide des agents vers la zone d'intérêt.

### 3. Blob (Physarum polycephalum)
Le Blob est un organisme unicellulaire capable d'optimiser ses réseaux de transport (comme la recherche du chemin le plus court dans un labyrinthe) sans système nerveux central.
Dans GenOS, la stratégie du Blob est utilisée pour l'exploration de graphes (comme l'arbre des dépendances d'un projet). Les agents déposent des "phéromones" ou des marqueurs virtuels sur les chemins explorés. Les chemins menant à des impasses se résorbent, tandis que les chemins fructueux sont renforcés, optimisant la navigation future.

### 4. GWO (Grey Wolf Optimizer)
Le GWO (Optimisation par les Loups Gris) simule la hiérarchie sociale et les techniques de chasse des loups. La meute est divisée en :
- **Alpha** : Les leaders prenant les décisions.
- **Beta** : Les subordonnés aidant à la prise de décision.
- **Delta** : Les éclaireurs ou sentinelles.
- **Omega** : Les exécutants suivant la meute.

Dans GenOS, GWO est utilisé pour des tâches de résolution de problèmes complexes (comme le débogage systémique). Les alphas dirigent la recherche (génération d'hypothèses), les betas et deltas valident et explorent des pistes secondaires (collecte de preuves), tandis que les omegas exécutent des tâches routinières.

## Implémentation via Heuristiques Mathématiques

Afin de ne pas saturer les LLMs de calculs spatiaux ou de décisions triviales, l'implémentation de ces comportements est déléguée à des **heuristiques mathématiques pures**.

Au lieu de demander au LLM "où dois-tu aller maintenant ?", le cœur du système GenOS calcule la position et le vecteur de déplacement de l'agent en utilisant des algorithmes déterministes.

```python
# Exemple simplifié (pseudo-code) pour la règle de cohésion des Boids
def calculate_cohesion(pos, neighbors):
    center = sum(neighbors) / len(neighbors)
    return normalize(center - pos) * COHESION
```

Le LLM n'est sollicité que lorsque l'agent atteint un point d'intérêt significatif ou lorsqu'une analyse sémantique est requise. Les déplacements intermédiaires et le maintien de la formation sont gérés nativement par le moteur mathématique de GenOS.

## Optimisation de l'Usage des Tokens LLM

Cette architecture biomimétique offre des avantages massifs concernant la consommation de tokens :

1. **Calculs Déportés** : Le LLM n'a pas besoin de justifier ou de calculer chaque étape de navigation. La coordination spatiale est calculée par le CPU (heuristiques) sans générer un seul token.
2. **Réduction des Communications Inter-Agents** : Au lieu que les agents s'envoient des messages textuels pour se coordonner (prompt/réponse LLM), ils réagissent aux vecteurs de position des autres agents ou à des marqueurs environnementaux (stigmargie).
3. **Activation Ciblée** : Les agents ne consomment pas de tokens pendant les phases de déplacement pur. Ils ne sont "réveillés" pour une inférence LLM que lorsque l'heuristique mathématique détecte une condition nécessitant une intelligence supérieure (ex: un loup alpha trouve une anomalie dans le code, un agent boid rencontre un bloc de code inattendu).
