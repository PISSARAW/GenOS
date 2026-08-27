# Pareto Selection (Frontière de Pareto)

Dans des scénarios d'évaluation multi-objectifs (par exemple : maximiser la vitesse tout en minimisant le coût ou la consommation mémoire), GenOS refuse de forcer un gagnant unique de manière arbitraire.

## Fonctionnement

Le moteur qualifie les branches de **`non_dominated`** (non dominées) lorsqu'elles représentent un compromis valide, où aucune autre solution n'est strictement meilleure sur tous les objectifs évalués.
La sélection finale préserve l'intégralité de la frontière de Pareto, offrant ainsi à l'opérateur ou à l'algorithme d'évolution une vision complète des compromis optimaux.

## Interface CLI

Pour exécuter une sélection de Pareto via CLI, vous devez fournir un manifeste JSON (ou YAML) décrivant les branches et leurs scores respectifs :

```bash
genos experiment select <input_manifest.json> --format json
```

## Intégration MCP

L'outil `genos_pareto_eval` permet aux agents de déléguer cette tâche d'évaluation et de filtrage multi-objectifs de manière automatisée.
