# Biomimétisme : Morphogenèse et Différenciation Cellulaire dans GenOS

L'architecture de GenOS (particulièrement le module `genos-eval` et son système MCTS) s'inspire profondément de la biologie du développement, en particulier des mécanismes de morphogenèse. Ce document détaille les fondements théoriques et l'implémentation de ces processus.

## 1. Gradients de Turing (Auto-organisation Spatiale)

Alan Turing a théorisé en 1952 que des motifs complexes (rayures de zèbres, taches de léopards) pouvaient émerger de l'interaction entre deux substances chimiques appelées **morphogènes** : un *activateur* et un *inhibiteur*.

### Le Modèle Gierer-Meinhardt

Dans GenOS, nous utilisons les équations de réaction-diffusion de Gierer-Meinhardt pour simuler ce comportement au sein de l'arbre MCTS :

* **L'activateur ($u$)** : Favorise sa propre production et stimule l'exploration de nouvelles branches.
* **L'inhibiteur ($v$)** : Diffuse plus rapidement que l'activateur et réprime sa production, agissant comme un frein naturel pour éviter l'emballement exploratoire et forcer le recentrage sur les branches viables.

Lorsqu'un nœud MCTS est étendu (cf. `MctsEngine::expand_node`), il met à jour la concentration locale (le `positional_gradient`) en calculant l'évolution de la réaction chimique simulée, permettant à l'arbre de recherche de croître de manière organique et équilibrée.

## 2. Information Positionnelle (Modèle du Drapeau Français)

Lewis Wolpert a étendu la compréhension de la morphogenèse en 1969 avec le concept d'information positionnelle, illustré par le modèle du "Drapeau Français".

### Le Principe
Les cellules d'un embryon "connaissent" leur position spatiale en mesurant la concentration locale d'un morphogène diffusant depuis une source. Selon cette concentration, elles lisent différents "programmes" génétiques et se différencient.

### Application à l'Agentivité
Les agents GenOS se différencient dynamiquement (`AgentRole`) en fonction du `positional_gradient` :
* **Zone Bleue (Forte concentration)** : L'agent adopte le rôle `Explorer` (forte activité d'exploration et de création, typiquement aux extrémités naissantes de l'arbre).
* **Zone Blanche (Concentration moyenne)** : L'agent adopte le rôle `Exploiter` (affinement, optimisation des acquis et nettoyage du code).
* **Zone Rouge (Faible concentration)** : L'agent passe en `Idle` (conservation d'énergie, élagage passif des branches inertes).

## 3. Plasticité Synaptique (STDP)

Pour compléter ces dynamiques spatiales, GenOS intègre une dimension temporelle d'apprentissage via la règle de Hebb, modélisée par le STDP (Spike-Timing-Dependent Plasticity).

Pendant la phase de rétropropagation de l'arbre MCTS, les nœuds agissent comme des synapses neuronales. Leurs poids (`synaptic_weight`) sont modifiés en fonction du succès ou de l'échec des chemins explorés (`apply_potentiation` et `apply_depression`). Cette mécanique de renforcement assure que l'organisme virtuel retient ses apprentissages de manière distribuée et favorise l'activation rapide des chemins menant vers des solutions optimales.
