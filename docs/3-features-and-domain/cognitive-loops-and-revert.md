# Spécifications Techniques : Boucles Cognitives & Safest Revert Point

Pour construire un agent autonome robuste ou implémenter ces concepts dans `genos-core`, voici les spécifications techniques et les algorithmes sous-jacents qui gèrent ces deux problématiques majeures de l'US 3.1.

## 1. Détection des Boucles Cognitives (Infinite Loops)

Une boucle cognitive se produit lorsqu'un agent IA effectue en boucle le cycle `Perception -> Raisonnement -> Action` sans progresser vers l'objectif (ex: générer une erreur, essayer de la corriger, régénérer la même erreur).

### A. Mécanismes de détection (Runtime Monitoring)
Un "Circuit Breaker" (disjoncteur) doit être implémenté au niveau de la boucle d'exécution de l'agent. Il analyse la trajectoire en temps réel selon 3 critères :

1. **Correspondance stricte d'arguments (Exact Signature Match) :** Si l'agent appelle l'outil `edit_file` avec exactement les mêmes arguments 3 fois de suite, le disjoncteur coupe l'exécution.
2. **Similarité Sémantique (Cosine Similarity) :** On vectorise les "Thought" (les pensées générées par l'agent avant l'action) à chaque itération. Si la similarité cosinus entre la pensée à l'itération $N$ et l'itération $N-2$ dépasse $0.95$, l'agent est probablement coincé dans une boucle conceptuelle.
3. **Absence de mutation d'état (State Stagnation) :** Si après $N$ étapes, le hash de l'état du monde (ex: le hash du fichier ciblé ou le résultat du test unitaire) reste identique, l'agent dépense des tokens à vide.

### B. Action corrective
Lorsqu'une boucle est détectée, le système ne se contente pas de crasher. Il déclenche une exception de type `CognitiveLoopDetectedError` qui force l'agent à passer à l'algorithme de "Revert".

## 2. L'algorithme du "Safest Revert Point"

Si une trajectoire échoue (erreur fatale ou boucle cognitive détectée), il faut annuler les actions. Un simple "Undo" chronologique est dangereux car il pourrait annuler une bonne modification faite à l'étape $T-3$ à cause d'une erreur faite à l'étape $T-1$.

L'algorithme du Safest Revert Point (Point de Restauration le plus Sûr) s'appuie sur l'analyse du **Graphe de Dépendance des Actions (Action Dependency Graph)**.

### Comment ça marche ? (Spécification)
- **Traçabilité des dépendances :** Chaque action modifie des variables d'état (ex: Fichier A, Fichier B). Le système maintient un graphe acyclique dirigé (DAG) de ces modifications.
- **Identification de la cause racine (Causal Divergence) :**
  - L'erreur finale survient à l'état $T_n$.
  - Le module "Critique" (ou un LLM évaluateur) analyse l'historique pour trouver l'action $T_m$ qui a introduit l'anomalie logique.
- **Calcul du point de restauration :**
  - L'algorithme identifie le dernier état stable (Last Known Good State) juste avant $T_m$. C'est notre candidat primaire de Revert.
- **Préservation Parallèle (Cherry-picking) :**
  - Si des actions ont été effectuées entre $T_m$ et $T_n$ sur des branches indépendantes du DAG (ex: l'agent a modifié le fichier `README.md` sans rapport avec le bug de code), ces actions "positives" sont isolées et réappliquées après le rollback au point $T_m$.

## 3. Autres Spécifications Architecturales à prendre en compte

Pour que ces algorithmes fonctionnent, l'architecture doit intégrer ces concepts :

- **Séparation Agent Acteur / Agent Critique (Policy Agent) :** L'agent qui génère le code ne doit pas être celui qui évalue la boucle. Il faut un petit LLM séparé (Agent Critique) qui observe la trajectoire de manière asynchrone et vote sur la progression. S'il vote "Stagnation", le Revert est déclenché.
- **Contrats d'Exécution (Execution Guardrails) :** Définir des limites matérielles dures (ex: Max 15 itérations, Max 50 000 tokens) au-delà desquelles le système passe d'une automatisation totale à une Escalade Humaine (Human-in-the-loop fallback).
- **Architecture Orientée Événements (Event-Sourced) :** L'état de l'application ne doit pas être une base de données mutée en place, mais un registre d'événements append-only (Event Sourcing). C'est le seul moyen technique de rejouer des trajectoires ou de restaurer des états passés avec une fiabilité de 100%.

> [!NOTE]
> Cette conception s'appuie fortement sur l'Event-Sourcing et la structure de "CausalBoundary" déjà en place dans `genos-core`.
