# ADR 0385 — Contrat de vérification des snapshots topologiques

- **Statut** : accepté
- **Date** : 2026-10-10
- **Domaine** : topologies, snapshots, reprise
- **Décideurs** : équipe GenOS
- **Lié à** : [snapshot d'organisme](0367-sections-durables-snapshot-organisme.md), [reprise et frontières](0368-reprise-curseur-mission-et-frontieres-runtime.md)

## Contexte

Le snapshot d'organisme capture les fichiers du workspace et plusieurs sections
durables de l'agent. Les huit topologies ont aussi des sessions, journaux,
participants et effets partagés qui ne sont pas restaurés par cette opération.
Assimiler une référence de session à une copie restaurable ferait perdre ou
dupliquer des décisions collectives.

## Décision

Un adaptateur par topologie produit un manifeste versionné pour le variant et la
session concernés. Il dérive les composants depuis la base serveur et vérifie
leur lien exact avec l'agent et son workspace. Le contexte et la portée reçus
par l'adaptateur ne constituent pas à eux seuls une preuve de propriété.

Chaque composant annonce `captured`, `reference-only`, `unsupported` ou
`conflict`. Une capture requise est refusée lorsque l'adaptateur manque ou
annonce `unsupported` ou `conflict`. Les composants et le manifeste portent
des empreintes SHA-256 ; le manifeste est lié à la topologie, au variant, à la
session, à l'agent et au workspace. Son intégrité ne constitue pas une
signature indépendante de la base qui le conserve.

Avant la restauration des fichiers, le service recapture l'état topologique,
compare la frontière de cohérence et toutes les empreintes, puis exécute le
contrôle propre à l'adaptateur. Tout changement, y compris d'une référence
`reference-only`, bloque l'opération. Le plan accepté est `verify-only` avec
`restorable: false` : il autorise seulement la reprise de l'agent tant que
l'état collectif est identique. Aucun adaptateur ne reçoit ici le pouvoir de
rembobiner une session collective.

## Conséquences

- La reprise d'un workspace peut être refusée même si ses fichiers sont intacts,
  lorsque la session topologique a avancé.
- Les variantes à votes, réplication, migrations ou effets externes doivent
  exposer leurs propres frontières et reçus ; leur absence est un refus.
- Les adaptateurs ne promettent pas de transaction atomique entre fichiers,
  SQLite, Rust et services externes.

## Alternatives

- Restaurer le JSON de session avec les fichiers : rejeté, car cela pourrait
  écraser des écritures concurrentes et rejouer des effets déjà accomplis.
- Accepter une référence de session sans contrôle de dérive : rejeté, car la
  simple présence d'un identifiant ne prouve pas la cohérence de la reprise.
