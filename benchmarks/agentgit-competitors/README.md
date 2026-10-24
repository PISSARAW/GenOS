# Protocole de comparaison AgentGit

Ce répertoire définit un format commun pour comparer GenOS à Letta, GitAgent,
GCC, LangGraph et DGM. Le scoreur ne lance pas ces produits et ne fabrique pas
de résultats : chaque adaptateur doit produire un reçu JSON par scénario et
joindre une preuve à chaque résultat `pass` ou `fail`.

Les métriques sont descriptives : intégrité des snapshots, isolement des
branches, conservation des contradictions, sûreté des permissions et replay.
Les scénarios ne sont comparés que lorsque tous les systèmes ont fourni le
même identifiant de tâche. Les résultats `unsupported` et `not_run` restent
visibles et ne deviennent pas des échecs ou des réussites implicites.

Le format est `genos.agentgit-benchmark/v1`. Les reçus doivent renseigner le
système, sa version, l’adaptateur, la date de collecte et les mesures par tâche.
`score.cjs` valide ces reçus et produit un rapport sans classement automatique.
Le benchmark n’est pas considéré comme publié tant que des runs réels et leurs
preuves ne sont pas fournis pour les systèmes comparés.

Validation locale du scoreur : `node benchmarks/agentgit-competitors/test.cjs`.
