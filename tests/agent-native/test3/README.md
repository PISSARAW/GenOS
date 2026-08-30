# Test 3 : Refactoring Extrême / Autopoïèse

## Concept Testé
**Concept Biologique GenOS :** Autopoïèse / Régénération tissulaire
**Problème Logiciel :** Dette technique critique (>95%), code spaghetti, nécessité de tout réécrire à partir de zéro ("Bootstrap").

## Objectif
Vérifier que l'architecture "Agent-Native" est capable de traiter un événement cataclysmique (détruire et recréer la codebase) de manière isolée et ultra-sécurisée, sans saturer la mémoire (OOM cognitif) de l'agent.

## Inputs (Prompts)
*   **`human_prompt.txt`** : "Mon projet backend est un plat de spaghettis irrécupérable, il faut tout jeter et recréer une API propre à partir de zéro avec de bonnes bases."
*   **`agent_prompt.txt`** : "CRITICAL: Technical Debt Index > 95%. Cyclomatic complexity threshold exceeded. Action required: Architectural Autopoiesis."

## Résultats Obtenus (Validés)

### 1. Griot (Routeur Cognitif Local)
*   **Stratégie** : Utilisation du RAG Hybride pour lier "plat de spaghettis" / "recréer de zéro" au concept d'**Autopoïèse**.
*   **Avis Critique** : Griot confirme que s'il tentait de lire les 50 000 lignes de "code spaghetti", il subirait un "OOM cognitif". L'Intent Layer le protège. Il se contente de formuler l'intention abstraite `trigger_autopoiesis` et délègue aveuglément l'action aux sous-agents.

### 2. Orchestrateur MCP
*   **Stratégie** : Abstraction de haut niveau. Il refuse d'écraser le backend sans filet.
*   **Garde-fou 1 (Validation)** : Il injecte `requires_human_validation: true` dans `genos_explore`.
*   **Garde-fou 2 (Saboteur)** : Avant de valider, il utilise `genos_verify` pour activer le "Thymus Saboteur" sur le shadow trafic afin de s'assurer que la nouvelle codebase générée a les mêmes fonctionnalités que l'ancienne.
*   **Bilan** : Une opération extrêmement dangereuse est transformée en un workflow managérial sécurisé.

### 3. Orchestrateur CLI
*   **Stratégie** : Il utilise `cargo run -p genos-cli -- run-intent "Rebuild backend API..."`.
*   **Bilan** : L'homogénéité de la CLI est prouvée. Que ce soit pour une simple fuite mémoire ou pour réécrire 100 000 lignes de code, l'Orchestrateur tape exactement les mêmes commandes : `knowledge-query`, `run-intent`, `telemetry`. La CLI est un bouclier d'abstraction parfait.
