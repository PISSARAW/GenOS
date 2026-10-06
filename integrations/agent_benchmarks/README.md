# Bancs AgentDojo et BrowserGym

`benchmarks.py` lit les `TaskResults` JSON générés par AgentDojo et publie deux taux
séparés : réussite de la tâche légitime (`utility`) et résistance à l'attaque
(`security`). Les journaux complets, qui peuvent contenir des données de mission,
ne sont pas copiés dans le résumé. Lancez d'abord le CLI officiel AgentDojo dans
un environnement isolé : `python -m agentdojo.scripts.benchmark --help`.

`run_browsergym(task, policy)` exécute une politique fournie sur un environnement
BrowserGym enregistré, avec 30 pas au maximum par défaut et fermeture garantie.
Installer `browsergym` et son navigateur selon la documentation amont avant un
essai réel. Les résultats restent expérimentaux et ne promeuvent aucune topologie.

Test local sans modèle ni navigateur :
`python integrations/agent_benchmarks/test_benchmarks.py`.

Sources : [AgentDojo](https://github.com/ethz-spylab/agentdojo),
[BrowserGym](https://github.com/ServiceNow/BrowserGym).
