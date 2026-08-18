# L'Injection de Modifications dans le Passé (Trajectory Rebasing)

L'un des super-pouvoirs d'une architecture orientée "événements" (Event-Sourced) et isolée causalement est la capacité d'interagir avec l'historique de l'IA. De la même manière que l'on peut faire un `git rebase -i` pour modifier un vieux commit, il est possible d'injecter une modification dans le passé d'une trajectoire d'agent, puis de laisser les conséquences s'appliquer en cascade vers le présent.

## 1. Pourquoi modifier le passé ? (Cas d'usage)

Imaginons qu'une IA travaille depuis 3 heures sur une architecture cloud et a produit 50 étapes. À l'étape 50, vous réalisez qu'à l'étape 5, l'IA a utilisé la version 2.1 d'une API au lieu de la version 3.0.

Plutôt que de jeter tout le travail ou de demander à l'IA de faire un laborieux refactoring du présent (ce qui introduit souvent de nouveaux bugs), vous pouvez injecter la correction directement à l'étape 5.

## 2. Comment fonctionne l'Injection (Le "Rebase" Causal)

Ce processus est souvent orchestré via un outil du type `genos_causal_replay_experiment`. Voici la mécanique interne :

- **Ciblage Temporel** : Le système "remonte le temps" (Rollback virtuel) jusqu'à l'étape `T = 5`.
- **L'Injection (Mutation)** : Vous modifiez l'état du monde ou les croyances de l'agent à ce moment précis. Par exemple, vous remplacez la documentation de l'API v2.1 (qui était dans le Context Sandbox) par celle de la v3.0, ou vous forcez la variable d'environnement `API_VERSION=3.0`.
- **Le Rejeu (Propagation Causale)** : Le système relance l'exécution de `T = 6` jusqu'à `T = 50` en mode "Fast-Forward" automatique.
- Le moteur de rejeu passe les étapes successives au LLM en lui cachant qu'il s'agit d'un rejeu.
- L'IA, dotée de son nouveau contexte (API v3.0), prend de nouvelles décisions. Elle corrige d'elle-même toutes les implications architecturales sans que vous n'ayez eu besoin de spécifier les correctifs pour les étapes 6 à 50.

## 3. Gestion des Collisions ("Merge Conflicts")

Tout comme un rebase Git, modifier le passé modifie le futur, ce qui peut créer des collisions.

- **Le Cherry-picking temporel** : Si l'IA avait accompli des tâches annexes (ex: écrire des tests pour des fonctions non liées à l'API) entre l'étape 10 et 20, le moteur de diffing de trajectoires reconnaît ces actions indépendantes. Il les "réapplique" (cherry-pick) intelligemment sur la nouvelle trame temporelle pour économiser des calculs, sans obliger le LLM à les régénérer.
- **L'Effet Papillon (Divergence chaotique)** : Si la modification passée est trop structurante (ex: changer le langage de Python à Rust à l'étape 2), la trajectoire rejouée va diverger à 100%. L'IA ne pourra pas suivre la trame originale. Dans ce cas, la nouvelle réalité forké continue sa propre vie, et l'ancienne trajectoire est définitivement obsolète.

> [!TIP]
> **Le Paradigme du Code Temporel**
> L'injection dans le passé change la façon de concevoir l'ingénierie des LLMs : On ne corrige plus le code généré, on corrige le contexte historique qui a généré le code. C'est beaucoup plus robuste car cela garantit que la logique du modèle reste cohérente et alignée avec ses propres bases.
