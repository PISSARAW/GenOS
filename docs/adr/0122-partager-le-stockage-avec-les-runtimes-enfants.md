# ADR 0122 — Partager explicitement le stockage avec les runtimes enfants

## Statut

Acceptée

## Contexte

La campagne peut isoler sa base SQLite et ses capsules sous une racine dédiée. Les runtimes enfants filtrent leur environnement, puis le serveur MCP reçoit une configuration d'environnement construite séparément. Sans transmission explicite de `GENOS_DB_PATH`, le processus MCP peut reprendre la configuration `.env` du dépôt et ouvrir la base par défaut. Les workers créent alors des sauvegardes et des écritures de télémétrie hors du dossier isolé.

## Décision

Transmettre aux processus enfants uniquement les paramètres de stockage explicitement autorisés : chemin de base, racine de capsules et délai SQLite. Le chemin défini par le processus GenOS parent est l'autorité ; une valeur fournie dans l'environnement de mission ne peut pas le remplacer. Les workers MCP ne relancent pas la sauvegarde de la base : le processus orchestrateur propriétaire a déjà initialisé et sauvegardé la base avant leur démarrage. Un orchestrateur autonome conserve le comportement normal de sauvegarde.

## Conséquences

- Les runtimes et serveurs MCP d'une mission partagent la base et les capsules configurées par le parent.
- Les secrets et les variables non autorisées restent filtrés.
- Les tests de non-régression vérifient la propagation jusqu'à la configuration du serveur MCP.
- Une campagne ne peut revendiquer l'isolation que si chaque couche reçoit le même chemin de stockage.
