# ADR 0792 — Admission locale des écritures du journal Rust

- **Statut** : Accepté
- **Date** : 2026-11-04
- **Domaine** : runtime Rust, concurrence et journal de mission

## Contexte

La validation du workspace à la révision `7dd35594` a échoué dans le scénario
SDK hiérarchique positif avec `database is locked`. Les agents frères utilisent
des connexions distinctes au même journal SQLite. Une transaction peut vérifier
un historique complet avant son commit ; le délai SQLite de cinq secondes ne
constitue pas une file d'admission entre les threads du processus.

## Décision

Les connexions Store partageant un chemin canonique partagent un verrou local
pour le bootstrap WAL et schéma, les admissions, les transactions courantes,
les observations historiques et les successions. Le registre conserve des
références faibles. Les bases en mémoire restent indépendantes.

L'attente utilise une échéance monotone fixée à l'entrée et plafonnée. Pour les
opérations courantes, elle ne dépasse pas le temps restant du bail. Les contrôles
SQL de l'identité, de l'incarnation et de l'expiration restent exécutés après
l'attente et avant le commit. La réentrance sur le même journal est refusée.

Une observation d'un appel déjà émis conserve le contrôle historique exact et
peut enregistrer son résultat après expiration, comme auparavant. Son attente
reste bornée. Elle ne crée aucune autorisation d'effet ou de nouvel appel.

Le verrou est relâché à la fin de chaque transaction, avant tout transport LLM.
Aucun callback, commit, outil ou appel HTTP n'est rejoué en cas d'échec.

## Conséquences

La concurrence des écritures locales devient explicite ; les transports des
agents restent parallèles. SQLite continue de gérer les conflits avec d'autres
processus et peut les refuser. Cette décision ne certifie ni vérité sémantique,
ni promotion, ni suppression de toute contention entre processus.

Les preuves distinguent le test de collision avant correction, les tests après
correction et la validation complète. Les délais de mission, les budgets et
les contrôles des sept protocoles ne sont pas augmentés.
