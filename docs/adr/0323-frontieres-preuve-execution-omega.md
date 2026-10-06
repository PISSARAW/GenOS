# ADR 0323 — Frontières de preuve et d’exécution Omega

## Statut

Accepté pour le durcissement du runtime, pas comme certificat de complétude.

- Date : 2026-10-06
- Portée : runtimes Node/Rust Omega, MMU, visibilité, procédures et preuves.

## Contexte

Les tests positifs ne suffisaient pas à établir les invariants : autorisation
asynchrone ignorée par la MMU, obligations supprimées au niveau L0, résultats
simulés acceptés par le serveur Rust, et réutilisation inter-domaines possible.

## Décision

- Une optimisation économique conserve les obligations et dépendances. Répéter
  le même vérificateur ne fabrique pas une preuve indépendante.
- La MMU attend l’autorisation et la revérifie sur les hits de cache et après
  résolution. Session, portée et révision participent à la validité d’une page.
- SQLite persiste l’expiration et vérifie l’intégrité des objets matérialisés.
- `EMIT` ne reçoit que la valeur liée aux vérifications de ses dépendances.
  Un statut réfuté ne peut pas être compensé par `valid: true`.
- Le serveur Rust refuse les champs de résultats simulés. Le pilote de fixtures
  est un exemple séparé, non lié au serveur MCP. Les outils gardent les mêmes
  contrôles de chemins, schémas et leases que `tools/call`.
- La similarité procédurale ne traverse pas les partitions d’autorité, de projet
  ou de domaine. La généralisation demande une validation explicite ; le reçu et
  les prérequis sont vérifiés avant réutilisation.
- Les programmes explicites du routeur sont exécutés sans remplacement par le
  sous-graphe de compatibilité. L’inférence reçoit les valeurs de ses dépendances.

## Validation et limites

`npm --prefix backend run test:omega` regroupe les régressions du noyau.
`npm --prefix backend run test:interop` compare les six opérations sur les huit
domaines et plusieurs refus. Les handlers de cette matrice sont des fixtures :
elle ne prouve pas le déploiement de solveurs ou d’effets métier réels.

Le binding de chaque effet métier, les backends d’inférence/vérification Rust,
la reconfiguration complète des topologies et les campagnes empiriques PGO
restent des exigences distinctes. Leur absence doit bloquer l’exécution demandée,
jamais être remplacée par un succès synthétique. « 100 % » n’est pas revendiqué.

## Conséquences

Les programmes auparavant acceptés grâce à un résultat injecté, à une permission
asynchrone non attendue ou à un candidat différent du candidat vérifié sont
désormais refusés. Les intégrateurs doivent fournir les handlers autorisés et
les descripteurs exécutables de vérification. Les schémas sont évalués par AJV ;
un processus SMT terminé sans erreur ne suffit pas : sa réponse doit être
`unsat` pour être retenue comme vérifiée.

## Alternatives écartées

- Conserver les résultats de fixtures dans l'API MCP : confondrait entrée
  contrôlée par l'appelant et preuve produite par le vérificateur.
- Supprimer les obligations au niveau L0 : modifierait le contrat demandé.
- Réutiliser une procédure sur la seule similarité : ignorerait l'autorité,
  les prérequis et la validation nécessaire à la généralisation.
