# Échec du workspace source d’un worker

Le worker reçoit le chemin de son workspace depuis la mission et le workspace
du parent. Si cette source manque ou ne peut pas être lue, la création échoue
et remonte son erreur à l’orchestrateur.

`GENOS_WORKSPACE_ROOT` configure l’exécution du service. Il ne remplace pas le
workspace affecté à une mission : ce chemin peut viser un autre projet ou une
autre version du code. Un changement de source exige une nouvelle affectation
et une validation explicite de l’identité du workspace.

Le plafond de capsules et le mode VFS restent appliqués à la création du
workspace affecté. Le runtime ne relance pas automatiquement la copie depuis
une racine configurée de repli.

Régression : `node backend/tests/test_worker_workspace_source_failure.js`.
