# ADR 0395 — Workspaces privés pour les capsules de workers

- **Statut** : accepté
- **Date** : 2026-10-10
- **Domaine** : workspaces, délégation, snapshots
- **Décideurs** : équipe GenOS
- **Lié à** : [ADR 0385](0385-contrat-snapshot-topologique.md), [ADR 0332](0332-delegation-workspaces-scelles-trinity.md)

## Contexte

La délégation crée une capsule de fichiers isolée pour chaque worker. Hors du
parcours Trinity, l'agent persisté gardait l'identifiant du workspace parent.
Une capture d'état d'agent pouvait donc sélectionner les fichiers du parent au
lieu de ceux de la capsule exécutée.

## Décision

Avant de démarrer un worker ordinaire, enregistrer sa capsule comme workspace
privé et lier `agents.workspace_id` à son identifiant. Hériter la portée
organisation/projet du workspace parent dans la même transaction que ce lien.
Vérifier l'identité parent/worker, l'existence d'un répertoire distinct et
l'enregistrement de nettoyage ainsi que le marqueur d'époque de la capsule.
Refuser un autre enregistrement pour ce chemin ou une époque différente. Une nouvelle capsule de
réutilisation reçoit un nouvel identifiant ; les anciennes lignes et leurs
snapshots sont conservés. Le parcours Trinity conserve son enregistrement
spécialisé, lié au monde et au snapshot scellé.
Le démarrage d'une mission vérifie de nouveau le lien capsule/agent. Une règle
Cedar distincte autorise alors le parent à lancer ce worker dans son workspace
privé et à le contrôler ; elle n'autorise pas un workspace arbitraire ni un
tenant étranger.
Le garage et la délégation bornée appliquent la même preuve de capsule avant
de réserver un slot ou d'autoriser un sous-worker.
Le nettoyage automatique conserve la capsule tant qu'un agent y est rattaché
pour permettre une capture après exécution. Il la conserve aussi dès qu'un
snapshot de workspace référence ce chemin, car son payload durable y réside
par défaut.

La capture topologique reste une demande explicite sur l'agent. Les adaptateurs
continuent à vérifier la session, le variant et la portée tenant ; cette
décision ne donne aucun droit de restaurer l'état collectif.

## Conséquences

- Le snapshot d'un worker ordinaire cible sa capsule enregistrée.
- Les snapshots des capsules précédentes gardent leur identité ; ils ne
  peuvent pas être restaurés sur une nouvelle capsule de ce worker.
- Une capsule rattachée à un agent ou porteuse de snapshots reste sur disque
  jusqu'à la fin de ses références et un nettoyage explicite de ses artefacts.
- Les capsules historiques sans enregistrement distinct ne sont pas migrées
  automatiquement et doivent être traitées séparément si elles existent encore.

## Alternatives

- Conserver l'identifiant du parent et substituer le chemin au moment de la
  capture : rejeté, car l'identité du snapshot ne décrirait plus ses fichiers.
- Réutiliser un identifiant de workspace pour toutes les capsules d'un worker :
  rejeté, car une réutilisation changerait la cible des anciens snapshots.
