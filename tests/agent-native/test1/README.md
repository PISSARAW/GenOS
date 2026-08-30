# Test 1 : Fuite Mémoire (Memory Leak)

## Concept Testé
**Concept Biologique GenOS :** Apoptose (Mort cellulaire programmée / Libération de ressources)
**Problème Logiciel :** Fuite mémoire sévère (OOM_KILLER) sur le backend.

## Objectif
Vérifier que les agents (CLI, MCP, et Modèle Local) parviennent à diagnostiquer et résoudre le problème sans avoir à connaître la taxonomie biologique de GenOS, en s'appuyant uniquement sur le RAG Hybride (Knowledge) et la délégation asynchrone (Intent).

## Inputs (Prompts)
Pour rejouer le test, soumettre l'un des deux prompts à l'agent :

*   **`human_prompt.txt`** : "Le backend plante après 3 heures d'utilisation, la RAM explose. Répare ça."
*   **`agent_prompt.txt`** : "CRITICAL: OOM_KILLER invoked on pid 4092. Memory utilization 99%."

## Résultats Obtenus (Validés)

### 1. Griot (Routeur Cognitif Local)
*   **Stratégie** : Utilisation du RAG Hybride pour mapper les mots-clés (`RAM explose` ou `OOM_KILLER`) au concept `apoptosis` sans charger les 94 outils.
*   **Action** : Envoi d'un payload JSON d'intention (`analyze_memory_leak`) puis endormissement immédiat pour préserver son contexte contraint (16k tokens).
*   **Bilan** : Évite le "suicide computationnel" d'un contexte saturé.

### 2. Orchestrateur MCP
*   **Stratégie** : Approche managériale.
*   **Action** : 
    *   `genos_knowledge_query` pour comprendre le besoin.
    *   `genos_explore` en mode asynchrone ("Fire and Forget") avec `requires_human_validation: true` pour le prompt humain (action destructive).
    *   `genos_read_blackboard` pour observer la résolution.
    *   `genos_garbage_collect` pour nettoyer le contexte.
*   **Bilan** : Abstraction parfaite de la complexité. L'agent manipule des IDs de tâches et non des appels biologiques bas-niveau.

### 3. Orchestrateur CLI
*   **Stratégie** : Pipeline d'outils terminaux unifiés.
*   **Action** : 
    *   `genos run-intent "Cibler le backend pour OOM_KILLER"`
    *   S'il y a un doute sur l'intention humaine, ouverture immédiate du flux de surveillance avec `genos telemetry`.
*   **Bilan** : Les retours console confirment que le backend Rust gère le pont avec la biologie en arrière-plan de manière invisible pour l'Orchestrateur.
