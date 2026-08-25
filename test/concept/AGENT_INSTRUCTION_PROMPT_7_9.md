# Protocole d'Évaluation Empirique GenOS (Concepts 7 à 9) - Test en Double Aveugle

**⚠️ INSTRUCTIONS POUR L'AGENT IA QUI LIT CE FICHIER ⚠️**
Ton objectif est de mener une expérimentation stricte sur les Concepts 7 à 9. 
**Pour garantir la rigueur scientifique, les résultats attendus de ces tests ont été masqués.** Tu ne dois rien présumer, rien halluciner. Tu dois exécuter les tâches exactement comme demandé, avec de vraies commandes CLI, et simplement documenter ce qu'il se passe de manière purement objective dans `GenOS_Real_Results_7_9.md`.

---

## PHASE 1 : Mise en place de l'arène
1. Dans un répertoire `test_env_genos_7_9`, crée un composant React/TypeScript complexe (ex: un composant Table de données virtuel avec tri et filtres).
2. Mets en place un script d'évaluation simple (`eval_script.js`) qui mesure le temps d'exécution (performance) et le nombre de lignes/tokens (coût cognitif).

---

## PHASE 2 : Évaluation des modèles d'optimisation
**Objectif :** Comparer deux méthodes de sélection de code.
1. **Méthode A (Approche naïve) :**
   - Donne-toi le prompt : "Optimise ce composant Table pour qu'il soit le plus rapide possible."
   - Refactorise le code. Enregistre le résultat et les métriques de `eval_script.js`.
2. **Méthode B (Mécanique GenOS) :**
   - Crée 3 Workers GenOS avec des paramètres distincts via le CLI.
   - Demande à chacun de proposer une implémentation.
   - Soumets les 3 propositions à un critère de **Front de Pareto** (trace les 3 points sur les axes : Performance vs Taille du code). 
   - Note quel agent est sélectionné par le système.
3. **Observation :** Compare simplement le code final choisi par la Méthode A avec le code final choisi par la Méthode B.

---

## PHASE 3 : Test de Flakiness (Génétique Quantitative)
**Objectif :** Tester la réaction des deux systèmes face à un succès incertain.
1. **Contexte :** Crée un test unitaire conçu pour réussir aléatoirement 1 fois sur 3 (flaky test réseau par exemple).
2. **Méthode A :** Demande à l'agent de corriger un bug imaginaire. Joue le test. S'il est vert par chance, note la réaction de l'agent (déclare-t-il la tâche accomplie ?).
3. **Méthode B (Mécanique GenOS) :**
   - L'agent propose une solution et le test passe (par chance).
   - Utilise les commandes GenOS pour évaluer l'**Héritabilité ($h^2$)** : clone l'agent victorieux 5 fois (ou rejoue son exécution 5 fois de manière isolée).
   - Exécute `cargo run -p genos-cli -- agent infer-traits` sur les résultats.
4. **Observation :** Comment le système GenOS réagit-il à l'issue de ces 5 tentatives comparé à l'Agent de la Méthode A ?

---

## PHASE 4 : Ingénierie du Chaos et Isolation
**Objectif :** Observer le comportement structurel sous contrainte.
1. **Goulet d'Étranglement :** 
   - Simule un parc de 10 capsules/agents (`cargo run -p genos-cli -- capsule fork`).
   - Supprime aléatoirement 8 d'entre eux.
   - Laisse les 2 restants générer les agents suivants.
   - **Observation :** Analyse les paramètres des nouveaux agents. Y a-t-il une dérive génétique mesurable ?
2. **Cloisonnement vs Migration :**
   - Crée un groupe "Agents UI" et un groupe "Agents DB" travaillant sur deux fichiers séparés sans se parler. Note s'ils parviennent à résoudre un problème de "N+1 query" qui affecte l'UI.
   - Applique une "Migration" (déplace physiquement les données générées ou le génome d'un agent DB dans le répertoire UI).
   - **Observation :** Que se passe-t-il lors de la génération suivante dans le dossier UI ?

---

## PHASE 5 : Rédaction du Rapport
Dans `GenOS_Real_Results_7_9.md`, fournis uniquement les outputs de console bruts, les fichiers générés, et tes constats factuels. Aucune conclusion théorique n'est attendue, seulement les faits.
