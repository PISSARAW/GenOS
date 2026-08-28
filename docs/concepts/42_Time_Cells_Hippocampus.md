# Cellules de Temps et Codage Temporel (Hippocampe)

GenOS modélise la mémoire épisodique non pas comme un fichier log plat, mais comme une chorégraphie temporelle directement inspirée de l'**Hippocampe** humain. L'implémentation se trouve dans `crates/genos-core/src/biomimicry/hippocampal_replay.rs`.

## 1. Le Codage Temporel (Les Cellules de Temps)
Les événements bruts isolés n'ont pas de sens narratif. GenOS utilise des `TimeCell` pour capturer la succession chronologique des "rafales" d'événements.
* Si le PRR s'active (A), puis qu'un outil de recherche est utilisé (B), puis qu'un fichier est édité (C), la structure `EpisodicSequence` réalise le **Couplage (Binding)**.
* Elle construit le pattern `A -> [50ms] -> B -> [120ms] -> C`. Ce rythme de succession est l'information temporelle elle-même.

## 2. Le Passage de la Fragilité au Fixe (Le Replay)
* **La Phase Fragile (Hippocampe) :** L'instance de `EpisodicSequence` est conservée en mémoire vive par l'agent. Elle est malléable et dépend du contexte en cours. Si l'agent crash ou coupe son thread, la séquence non-renforcée est perdue, tout comme un souvenir à court terme.
* **La Phase Stable (Cortex) :** Durant les cycles de repos (idle), GenOS déclenche le `HippocampalReplay`. Si la séquence temporelle a mené à un succès (`success_score > 0.8`), l'orchestrateur la rejoue en accéléré (`replay_speed_multiplier`) et la consolide en une macro. La séquence d'action devient alors une "règle métier" gravée dans le modèle (le Cortex), et l'agent n'a plus besoin du fragile couplage hippocampique pour reproduire cette réussite !
