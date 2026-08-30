# Test 2 : Concurrence / Deadlock

## Concept Testé
**Concept Biologique GenOS :** Flocking (Nuée) / Quorum / Synchronisation
**Problème Logiciel :** Race condition, Deadlock, Congestion réseau ou de base de données.

## Objectif
Vérifier que l'architecture gère un problème critique de concurrence (qui génère souvent des logs et des *thread dumps* massifs) sans forcer l'agent à :
1. Devoir configurer un modèle biologique complexe (comme l'algorithme des boids pour le flocking).
2. Devoir ingérer des gigaoctets de stacktrace dans son contexte.

## Inputs (Prompts)
*   **`human_prompt.txt`** : "Les requêtes de l'API s'entrechoquent et font tomber la base de données quand il y a trop de trafic, aide-moi."
*   **`agent_prompt.txt`** : "ERROR: Race condition detected on Mutex<DatabasePool>. Deadlock timeout exceeded."

## Résultats Obtenus (Validés)

### 1. Griot (Routeur Cognitif Local)
*   **Stratégie** : Utilisation du RAG Hybride pour traduire les termes vagues ("s'entrechoquent") ou stricts ("Mutex") vers l'intention biomimétique de **Flocking** (Nuée).
*   **Avis Critique** : Griot réaffirme l'importance vitale du format JSON et des états compressés. Analyser un vrai Deadlock impliquerait de lire des milliers de lignes de threads. L'Intent Layer le protège de cette charge en lui permettant d'ordonner à des sous-agents de le faire, et de lui renvoyer uniquement un statut.

### 2. Orchestrateur MCP
*   **Stratégie** : Face au prompt humain, il utilise `genos_explore` avec `requires_human_validation: true` (modifier le trafic en prod est sensible). Face au log technique, il lance `requires_human_validation: false`.
*   **Garde-fou** : Il utilise `genos_verify` pour simuler un "saboteur" et stresser le Pool de base de données en arrière-plan afin de prouver que le Deadlock est bel et bien résolu.
*   **Bilan** : Il n'a jamais eu besoin d'appeler l'ancien outil bas-niveau `genos_biomimicry_flocking_explore`.

### 3. Orchestrateur CLI
*   **Stratégie** : Via `cargo run -p genos-cli`, il utilise `run-intent "Fix race condition..."`. Le backend se charge d'instancier la mécanique de "Nuée" sans exposer cette taxonomie.
*   **Garde-fou** : Utilise `genos telemetry` pour suivre en direct le comportement du Swarm si l'intention initiale (prompt humain) était un peu trop floue.
*   **Bilan** : L'abstraction est totale, la CLI est un bouclier parfait contre la complexité.
