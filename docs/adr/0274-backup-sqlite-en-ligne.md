# ADR 0274 — Snapshot SQLite cohérent avant migration

- **Statut** : Accepté
- **Date** : 2026-10-27
- **Domaine** : Backend, persistance, migrations

## Contexte

Le backup pré-migration copiait directement le fichier principal SQLite alors
que la connexion était ouverte et que des workers pouvaient accéder à la base.
Cette copie peut échouer sur un verrou et ne tient pas compte des pages WAL.

## Décision

Le démarrage crée le backup avec l'API SQLite Online Backup depuis la connexion
ouverte, avant les migrations. Le backup reste best-effort pour ne pas bloquer
le démarrage; les sauvegardes existantes gardent leur nom et leur politique de
rétention.

## Conséquences

- Le snapshot inclut l'état validé de la base même lorsque SQLite utilise WAL.
- Une erreur du backup reste signalée et ne transforme pas un démarrage réussi
  en échec.
