# ADR 0048 — Session Holobionte persistante et journal de symbiose

## Statut

Accepté — première tranche de fondation.

## Contexte

Le mode Holobionte compose actuellement quatre consignes d'agent. Il ne porte
pas d'identité de session durable ni d'historique des relations Host/Symbiont.
La feuille de route demande une relation persistante et un journal
événementiel avant l'ajout de l'admission, de l'allocation adaptative ou des
gates de promotion.

## Décision

1. Introduire `HolobiontSession`, identifiée par un UUID et rattachée à un Host.
2. Supporter les scopes `MISSION`, `WORKSPACE`, `PROJECT` et `PERSISTENT`, avec
   validation des identifiants requis par scope.
3. Stocker une projection courante de la session et un journal SQLite séparé,
   append-only, des événements de symbiose.
4. Sérialiser l'ajout d'événement et l'avancement de révision dans une
   transaction SQLite ; permettre le contrôle optimiste par `expectedRevision`.
5. Conserver la composition quatre rôles existante comme compatibilité pendant
   cette tranche. La session n'exécute ni n'admet elle-même des symbiotes.

## Conséquences

- Les événements sont ordonnés par révision pour chaque session et ne peuvent
  pas être modifiés ou supprimés par SQL ordinaire.
- Le modèle de session accepte un nombre variable de résidents sans faire du
  nombre de rôles la structure persistée.
- Admission sandboxée, vérification de contrat avant promotion, constitution,
  ressources et routage par contrat restent des tranches ultérieures ; cette
  ADR ne les déclare pas implémentés.

## Alternatives

- Continuer à composer quatre membres sans identité durable : rejeté, car aucun
  état relationnel ne pourrait survivre à une mission ou à un redémarrage.
- Conserver tout l'état uniquement dans un champ JSON opaque : rejeté, car les
  événements et leur ordre ne seraient pas auditables indépendamment.
