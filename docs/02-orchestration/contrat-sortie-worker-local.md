# Sortie structurÃ©e des workers locaux

Un worker local sans modification de fichiers peut terminer avec les claims et le dossier exigÃ©s par son contrat, sans fournir `artifactText`. Les rÃ©fÃ©rences des claims restent limitÃ©es aux sources autorisÃ©es, notamment `mission` pour les donnÃ©es fournies dans la mission. Un rÃ©sultat `unresolved` ne contient aucun claim et indique les incertitudes.

Lorsque `artifactText` est fourni, son format balisÃ© reste contrÃ´lÃ©. Les expÃ©riences d'identitÃ© qui exigent explicitement un artefact conservent cette exigence. Les propositions de code suivent leur contrat propre et les gates de preuve et de validation restent applicables.

## Preuves de fichiers en lecture seule

Une mission locale peut activer `readOnlyWorkspaceEvidence: true` pour recevoir le contenu borné des fichiers de sa capsule et les références SHA-256 réellement lues. Le dispatch direct et le fallback Windows transmettent cette option au worker. Cette option n'accorde aucune écriture. Le modèle doit citer les références SHA-256 listées, et non inventer des reçus ou des chemins producteur.

L'identité d'exécution est explicite : un identifiant contenant `orchestrator` ne transforme pas un worker en orchestrateur. Les missions marquées `executionMode: worker` conservent donc le contexte de preuves de fichiers. Sans cette option, le contexte de fichiers n'est pas fourni implicitement.

## Politique du worker direct

Le dispatch direct conserve la priorité des paramètres explicites sur `executionPolicy`, puis sur les valeurs d'environnement pour les commandes et les éditions. Une liste de commandes invalide ou un JSON d'environnement illisible donne une liste vide. La normalisation est isolée dans `directWorkerPolicy.cjs` ; cette extraction ne modifie pas les autorisations accordées.
