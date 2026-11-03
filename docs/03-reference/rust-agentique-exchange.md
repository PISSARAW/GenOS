# Copies et publication CAS des missions agentiques Rust

Avant le premier contexte d’un agent, `agentic_exchange::receive` matérialise les
résultats de ses prédécesseurs directs. Le texte effectivement observé et les
artefacts créés sont rehashés, placés dans un espace CAS émetteur puis copiés dans
un espace destinataire distinct. Le paquet lie émetteur, destinataire, incarnation,
achèvement natif et objets. Cette opération est locale dans SQLite ; elle ne
prétend pas démontrer un transport réseau.

Le contexte SYNAPSE consomme le paquet reçu et revalidé. `read_artifact` d’un
prédécesseur lit également cette copie destinataire. Une ligne de journal seule
ne suffit donc pas : une copie absente, corrompue ou associée à un autre agent
empêche sa consommation. Les instructions contenues dans les documents et les
messages restent des données et ne modifient pas les outils autorisés.

La tête initiale est une vraie tête CAS SQLite, liée à la mission et au workspace.
Sa valeur et sa génération sont conservées avant les tours du graphe. La preuve
finale couvre cette base, le texte généré, la clôture, le contrat, la politique et
l’environnement. Le snapshot source, le texte et la clôture complète sont ensuite
copiés et rehashés dans les espaces CAS de publication.

`publish` réévalue EVIDENCE et ALLOSTASIE sous la même transaction que la
comparaison de l’ancienne tête/génération, la nouvelle tête, le reçu de publication,
l’événement OMEGA EMIT et le statut `completed` du run. Un échec SQL après le CAS
annule l’ensemble. Une base avancée exige une nouvelle évaluation : les anciens
résultats ne permettent pas de remplacer silencieusement une tête concurrente.
Les objets sont immuables et les noms d’artefacts ne sont jamais écrasés.

La reprise d’une publication exacte revalide la preuve, le contenu CAS et la tête
actuelle, puis retourne le même reçu sans nouvel appel HTTP ni nouvel outil.
Une observation de modèle connue mais non publiée peut être reprise depuis son
journal ; une issue HTTP inconnue ne déclenche aucun renvoi automatique.

L’origine reste `model_generated`. La publication prouve la satisfaction du
contrat textuel borné et la clôture locale. Elle ne déploie rien et n’autorise
aucune action métier : `semantic_truth_verified`, `promotable` et
`external_effects_authorized` restent `false`. Aucun rollback de systèmes externes
ou du système de fichiers utilisateur n’est revendiqué.
