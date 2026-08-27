# Tutoriel : Causal Lineage & Bisect-Agent

Ce tutoriel démontre comment GenOS peut identifier l'origine d'une erreur (introduite lors d'une étape antérieure et manifestée beaucoup plus tard) et la corriger en utilisant les outils de "Causal Bisect" et de "Causal Replay".

## 1. Contexte du problème (La Faille Silencieuse)

Lorsqu'un grand nombre de sous-agents collaborent sur un projet, une erreur subtile peut être introduite. Par exemple, un agent modifie le comportement d'un parser, les tests unitaires continuent de passer, et d'autres agents construisent sur cette base corrompue. L'erreur ne se déclare (ex: un crash de type `NullPointerException`) qu'après plusieurs itérations.

## 2. L'Outil `genos bisect-agent`

Plutôt que d'examiner manuellement chaque diff, GenOS permet de rechercher l'origine causale de l'erreur via l'Historian :

```bash
genos bisect-agent --target-error "NullPointerException in reporting" --bad HEAD --good HEAD~7
```

L'outil effectue une recherche dichotomique parmi les itérations d'agents, exécute des tests ciblés sur les snapshots, et isole la branche et le commit/snapshot exacts ayant introduit la régression (ex: l'étape 3).

## 3. Rejeu Causal (Causal Replay)

Une fois l'erreur isolée et corrigée au niveau du snapshot fautif (l'étape 3), nous pouvons rejouer l'historique de manière déterministe. 

```bash
genos_causal_replay_experiment --start-snapshot <ID_STEP_3> --end-snapshot HEAD
```

Plutôt qu'un simple `git rebase` (qui échouerait face à des conflits sémantiques), GenOS applique "intelligemment" les intentions originelles des agents sur la nouvelle base corrigée, en ré-exécutant les prompts nécessaires tout en évitant de casser ce qui fonctionne.
