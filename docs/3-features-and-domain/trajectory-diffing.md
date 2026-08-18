# Le Moteur de "Diffing" de Trajectoires

Le concept de Trajectory Diffing (Moteur de comparaison de trajectoires) est une évolution majeure par rapport au simple `git diff`. Alors que `git diff` compare des lignes de code statiques entre deux versions d'un fichier, le "Diffing" de trajectoires compare le cheminement d'actions, de décisions et d'états cognitifs pris par une IA (ou un système autonome) au fil du temps.

## 1. Pourquoi le "Code Diff" ne suffit plus pour l'IA ?

Lorsqu'un agent IA travaille sur un problème complexe (comme la résolution d'un bug ou la génération d'une architecture), il effectue des dizaines d'étapes : recherches sur le web, lectures de fichiers, tentatives de commandes, échecs, puis corrections.

Si l'on regarde uniquement le résultat final (le code source généré), on perd la "connaissance négative" : *Pourquoi l'IA n'a-t-elle pas utilisé cette librairie ? Quelle erreur a-t-elle rencontrée à l'étape 4 qui l'a forcée à changer de plan ?*

## 2. Le fonctionnement du Diffing de Trajectoires

Un moteur de diffing de trajectoires analyse une séquence chronologique d'états du système, enrichie par les "croyances" (beliefs) et les actions de l'agent.

Avec des outils comme `genos_diff` et `genos_analyze_trajectory`, le moteur est capable de :

- **Détection de Boucles Cognitives (Cognitive Loops) :** Repérer si l'agent IA tourne en rond. Par exemple : l'agent propose une solution A -> l'outil plante -> l'agent corrige avec B -> l'outil plante -> l'agent propose à nouveau A. Le moteur identifie cette boucle d'hallucination avant qu'elle ne consomme tous les crédits de l'API.
- **Détection de la première Régression :** Dans une longue séquence d'actions, si le résultat final est un échec, le moteur peut comparer la trajectoire avec une trajectoire historique réussie (Golden Trajectory) pour isoler l'étape exacte où l'IA a fait le mauvais choix ("Causal Divergence").
- **Point de Restauration Sécurisé (Safest Revert Point) :** Si la trajectoire déraille, le moteur ne fait pas un simple "Undo" (qui annulerait de bonnes actions). Il identifie le snapshot causalement indépendant le plus proche pour restaurer le monde avant la mauvaise décision, tout en gardant les acquis parallèles.

## 3. Implémentation conceptuelle dans GenOS

Dans l'écosystème GenOS, la trajectoire est une structure formelle. `genos_analyze_trajectory` prend en entrée un tableau chronologique structuré, par exemple : `snapshot | résultat_du_test (good/bad) | action_signature | belief_signature`.

### Cas d'usage : Le "Blame" Cognitif
Si une faille de sécurité est introduite par l'IA, un développeur humain utilise le Diffing de Trajectoires pour faire un `genos_blame`. Au lieu de voir "L'IA a écrit cette ligne", l'humain voit : *"À l'étape 12, l'IA a lu la documentation de l'API X obsolète (Context), ce qui a forgé sa croyance erronée Y (Belief), ce qui a conduit à injecter la ligne de code Z (Action)."*

> [!TIP]
> **Synthèse :** Le Diffing de Trajectoires transforme l'IA générative (boîte noire) en un processus auditable. Il ne compare pas *ce que* le système est devenu, mais *comment* et *pourquoi* il l'est devenu, étape par étape.
