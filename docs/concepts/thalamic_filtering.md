# Thalamic Filtering

Le filtrage thalamique (Thalamic Filtering) est un mécanisme bio-inspiré utilisé par l'Orchestrateur Anthony pour gérer la fenêtre de contexte de GenOS.

## Principe
Le cerveau reçoit en permanence des données sensorielles (bruit de fond, sensation des vêtements) qu'il filtre avant qu'elles n'atteignent le cortex préfrontal. 
De la même manière, les agents de GenOS génèrent du "Disposable context" (logs verbeux, résultats de recherche répétés, boucles infinies de debugging sans issue). 

L'orchestrateur Anthony implémente un filtre thalamique qui élimine les messages non-critiques et ne fait remonter que les deltas ou les anomalies (erreurs, changements d'états, warnings) vers le contexte actif de l'agent.
