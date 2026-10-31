# Artefacts créatifs et cliniques des workers locaux

Le schéma fournisseur décrit maintenant `candidate`, `assumptions` et
`falsificationTest` pour `creative_candidate`. Le texte complet et la notation
demandée restent dans `workerArtifact.content.candidate`. Les sauts de ligne
doivent être encodés une seule fois dans le JSON : les caractères décodés sont
évalués tels quels. Un candidat doublement échappé, incomplet ou dépourvu de ses
en-têtes ne reçoit aucune réparation silencieuse de l'évaluateur.

Pour `clinical_report`, le fournisseur demande deux sections explicites :
`missingInformation` et `emergencyWarningSigns`. Le runtime conserve la lecture
des rapports historiques sans ces champs, accepte les nouveaux tableaux de
textes et rejette les champs ou directives de diagnostic et prescription déjà
interdits. Un tableau vide est un format valide ; il ne satisfait pas une tâche
qui demande une couverture non vide.

Ces contrôles concernent la structure et les interdictions du contrat. Ils ne
prouvent pas la pertinence clinique, la qualité artistique ou l'interprétation
musicale. L'[ADR 0760](../adr/0760-schema-local-artefacts-creatifs-cliniques.md)
décrit la compatibilité et le test `test_specialized_worker_artifact_schema.js`.
