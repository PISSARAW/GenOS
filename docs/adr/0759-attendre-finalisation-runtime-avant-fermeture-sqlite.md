# ADR 0759 — Attendre la finalisation runtime avant fermeture SQLite

## Statut

Accepté le 30 octobre 2026.

## Contexte

La campagne Qwen a produit un reçu CLI collé à une erreur
`SQLITE_MISUSE: Database handle is closed`. Le statut du worker était déjà
terminal, mais sa promesse exécutait encore la finalisation Garage ou sa
reprise. Le registre `missionStarts` était déjà libéré pour permettre une
nouvelle exécution avec la même identité.

## Décision

Conserver un registre indépendant des promesses de démarrage jusqu'à leur
règlement complet. Le polling foreground exige ce registre vide, et le chemin
de fermeture attend son drainage, puis le flush de télémétrie, puis la fermeture
de la base. Le drainage réévalue les tâches afin d'inclure les reprises créées
pendant une finalisation. La sortie JSON du dispatch worker termine une ligne.

## Conséquences

Le registre d'identité garde son rôle antérieur. Les échecs continuent à être
enregistrés par le runtime et leurs promesses gardent leur rejet original ; le
drainage attend leur règlement sans les convertir en succès ni relancer une
mission. Une opération en cours peut prolonger la fermeture jusqu'à sa propre
limite d'exécution. Le test `test_runtime_finalization_shutdown.js` vérifie les
écritures SQLite réelles d'une finalisation retardée et d'une tâche imbriquée.
