# Sortie structurée des workers locaux

Un worker local sans modification de fichiers peut terminer avec les claims et le dossier exigés par son contrat, sans fournir `artifactText`. Les références des claims restent limitées aux sources autorisées, notamment `mission` pour les données fournies dans la mission. Un résultat `unresolved` ne contient aucun claim et indique les incertitudes.

Lorsque `artifactText` est fourni, son format balisé reste contrôlé. Les expériences d'identité qui exigent explicitement un artefact conservent cette exigence. Les propositions de code suivent leur contrat propre et les gates de preuve et de validation restent applicables.
