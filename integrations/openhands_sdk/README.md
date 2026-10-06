# Worker développeur OpenHands SDK

`run_task` lance l'agent OpenHands SDK dans un processus enfant, sur un
répertoire enfant de `GENOS_OPENHANDS_SANDBOX_ROOT`, avec un délai maximal.
Le processus retourne seulement `candidate_only` ou `failed`. Les fichiers
modifiés restent dans cet espace de travail ; aucune promotion, fusion, ni
preuve d'effet ne découle de la fin de la conversation.

Le processus peut exécuter un terminal : `GENOS_OPENHANDS_SANDBOX_ROOT` est
un garde de chemin, **pas** une isolation système. Utiliser un conteneur ou
une autre sandbox OS dédiée avant tout essai sur du code non fiable. Les tests
locaux valident le contrat d'entrée et le confinement de chemin, sans lancer
le modèle ni installer le SDK.

Source : [OpenHands Software Agent SDK](https://github.com/OpenHands/software-agent-sdk).
