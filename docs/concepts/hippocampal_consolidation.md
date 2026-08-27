# Hippocampal Consolidation

La consolidation hippocampale (Hippocampal Consolidation) permet de libérer le contexte actif en transférant les informations utiles dans la mémoire à long terme.

## Principe
L'hippocampe chez les mammifères garde la mémoire de travail pendant la journée. Lors du sommeil, il transfère (consolide) les apprentissages et les schémas récurrents vers le néocortex, puis efface la mémoire de travail.

Dans GenOS, l'Orchestrateur Anthony implémente ce concept en analysant l'historique d'un essaim après une longue tâche. Il extrait les *faits structurels* et les écrit dans un fichier de mémoire à long terme, ce qui permet à l'agent de repartir avec une fenêtre de contexte complètement vide tout en "n'oubliant" rien de fondamental.
