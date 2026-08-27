# Tutoriel : Hippocampal Consolidation & Skill Proceduralize

Ce tutoriel documente l'expérience d'optimisation par "biomimétisme" (implémentée dans `research/skill_consolidation_experiment.py`), permettant à GenOS d'extraire une suite d'actions réussies à partir d'une exécution chaotique et de la "figer" sous forme de macro déterministe.

## 1. Contexte Biomimétique

Inspiré du processus de consolidation hippocampique (le cerveau transférant les apprentissages et souvenirs récents vers la mémoire à long terme), GenOS peut observer des trajectoires d'agents (`genos_biomimicry_hippocampal_consolidate`) et repérer les chemins optimaux qui mènent au succès.

## 2. Déroulement de l'expérience

L'exécution du script démontre ce pipeline en trois phases :

### Phase 1 : Exécution Chaotique
L'agent effectue une tâche avec de multiples erreurs, impasses, et explorations aléatoires :
- `step 1: attempt_action_A (failed)`
- `step 2: attempt_action_B (success)`
- `step 3: random_exploration (failed)`
- `step 4: align_components (success)`
- `step 5: finalize_assembly (success)`

### Phase 2 : Consolidation Hippocampique
L'Historian analyse cette trajectoire. Il filtre le bruit (les étapes en échec) pour extraire le "winning graph" (le chemin exact menant au succès).

### Phase 3 : Skill Proceduralization
Si la variance du taux de réussite est suffisamment basse sur de multiples essais (ex: 0.1), l'Historian compile ce *winning graph* en une compétence déterministe via l'outil `genos_biomimicry_skill_proceduralize`.

Le système crée alors une nouvelle compétence hardcodée (ex: `fast_assembly_routine`) associée à des prérequis (`preconditions`). À l'avenir, si l'agent fait face à la même situation, il utilisera cette macro directe et déterministe au lieu de gaspiller des tokens dans des appels LLM coûteux et probabilistes.
