# ADR 0605 — Router les missions supervisées vers GQWF

- **Statut** : Accepté, activation explicite
- **Date** : 2026-10-18
- **Domaine** : Workspaces, exécution supervisée, GQWF
- **Amendé par** : ADR 0643 pour les runtimes déterministes, locaux et in-process

## Contexte

Le noyau GQWF sait ouvrir une vue logique, la matérialiser sous bail, réingérer
ses fichiers et libérer le dossier. Le parcours général de mission créait
cependant encore une copie ou un worktree avant de lancer le runtime, même
lorsque `executionPolicy.gqwfV2` était demandé.

La projection GQWF n'inclut pas Git, les dépendances de build ni les fichiers
exclus par la politique de snapshot. Elle ne peut donc pas remplacer sans
condition tous les runtimes natifs et in-process.

## Décision

Une mission orchestrateur opt-in `gqwfV2` diffère sa copie physique. Après la
création de son execution run, GenOS importe la source enregistrée, ouvre une
vue privée durable et matérialise cette vue uniquement pour le processus
supervisé. Le `cwd` et `GENOS_WORKSPACE_ROOT` du runtime pointent vers ce bail.

À la clôture, le reçu filesystem est terminé avant toute suppression. Une
exécution réussie est ingérée comme racine candidate ; une exécution échouée
est abandonnée. Dans les deux cas, le bail est ensuite libéré. La session
durable conserve le lien entre execution run, vue, bail, racine de base et
candidate. Aucune tête GQWF n'est publiée automatiquement.

Dans cette tranche initiale, les runtimes déterministes, locaux in-process et
les parcours non opt-in conservent les workspaces physiques existants. Un
chemin enregistré différent du workspace demandé fait échouer la mission avant
le lancement.

Cette restriction décrit la tranche initiale. L'ADR 0643 raccorde ensuite les
runtimes déterministes, locaux et in-process au même cycle GQWF lorsqu'ils
portent explicitement `executionPolicy.gqwfV2: true`. Les parcours non opt-in
restent physiques.

## Conséquences

- Le coût de la copie initiale est évité pour les orchestrateurs supervisés
  opt-in ; la matérialisation reste nécessaire au lancement du processus.
- Une candidate réussie survit à la suppression du dossier matérialisé sans
  devenir une preuve de promotion.
- Une erreur d'ingestion ou de libération bloque la finalisation et conserve
  l'état durable nécessaire à une reprise explicite.
- Le remplacement des capsules workers et la publication générale restent des
  tranches distinctes.

## Validation

`node backend/tests/test_gqwf_mission_execution.js`
