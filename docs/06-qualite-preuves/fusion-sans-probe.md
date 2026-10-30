# Fusion sans probe fonctionnel

Une fusion AgentGit sans probe configuré est refusée, quelle que soit la valeur
ancienne de `GENOS_AGENT_GIT_REQUIRE_MERGE_PROBES`. Un drapeau ne constitue pas
une preuve. Le statut reste `not_configured` et `verified` vaut `false`.

Le contrôle positif exécute le probe de budget enregistré dans un processus
isolé et conserve son empreinte de preuve. Le contrôle négatif dépasse le budget.
Les régressions couvrent aussi le drapeau obligatoire, facultatif et absent.
