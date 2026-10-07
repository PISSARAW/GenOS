# ADR 0346 — Journal de reprise des promotions

**Statut** : Accepté
**Date** : 2026-10-07
**Domaine** : Promotions, persistance et récupération

## Problème

La consommation des nonces empêchait le rejeu d'un reçu, mais deux assemblages
AEIS frais pouvaient encore promouvoir le même run. Après un arrêt du processus,
les étapes déjà appliquées ne disposaient pas d'un journal de reprise.

## Décision

Une ligne unique par run réserve la promotion et consomme ses nonces dans une
transaction SQLite `BEGIN IMMEDIATE`. Le contexte, le contrat, le workspace,
le tenant, les options, les primitives et l'assemblage d'origine sont conservés.
Le journal et chaque transition sont scellés par HMAC avec le trousseau AEIS.
Une nouvelle requête concurrente perd la réservation ; une reprise emploie le
contexte initial et refuse un changement de requête, d'identité ou de contrat.

Les phases sont `reserved`, `pipeline_done`, `post_pending`, `post_done` et
`completed`. Chaque phase relit le journal sous transaction avant d'agir.
Le pipeline autorisé applique ses mutations SQLite et son résultat dans la même
transaction. Une panne annule les mutations non committées. Une reprise après
commit saute le pipeline. Les handlers utilisent la connexion reçue dans leur
contexte. Les caches JSON de trajectoire et la diffusion d'exosomes sont
désactivés dans ce chemin : leur publication ne serait pas atomique avec SQLite.
La trajectoire et la mémoire canoniques restent dans SQLite.

Une fusion de workspace utilise un plan scellé contenant les préimages,
postimages et contenus. La destination est réservée à un seul run. Les fichiers
sont remplacés par renommage d'un fichier temporaire synchronisé. Après panne,
une postimage déjà présente est conservée sans nouvelle écriture ; une préimage
est remplacée ; un troisième contenu bloque la reprise pour réconciliation.
Le fichier temporaire résiduel est vérifié avant réutilisation. Les conservations
de branches et la transition finale sont committées dans SQLite après la fusion.

## Garanties et limites

- Les tests qualifient les arrêts forcés de processus et une application unique
  des effets SQLite committés. Ils ne prouvent pas une tolérance aux coupures
  électriques : le paramètre SQLite `synchronous` reste celui de l'exploitation.
- La fusion converge sur les postimages scellées, y compris après publication
  partielle. La réservation sérialise les promotions utilisant cette base.
  Elle ne verrouille pas un éditeur ou un autre processus écrivant directement
  dans les fichiers entre les contrôles.
- Les handlers extérieurs à la liste transactionnelle sont refusés dans cette
  reprise automatique. Aucune garantie universelle « exactement une fois » n'est
  attribuée à un service distant, au transport HTTP ou à la télémétrie.
- La mémoire de promotion reste best effort avec télémétrie d'échec. Son absence
  n'est pas une preuve de provenance ; les tests positifs relisent son parent
  scellé. Les assemblages historiques sont soumis à leur rétention existante.
- Une clé indisponible, un journal altéré ou une liaison tenant/contrat modifiée
  bloque la reprise. Les opérateurs doivent réconcilier la situation, pas effacer
  les nonces ou forcer un statut `completed`.

## Validation

`test_promotion_execution_recovery.js` exerce deux processus natifs avec deux
assemblages frais, puis six arrêts forcés : dans une primitive réelle, après
pipeline, dans la finalisation, après commit avant réponse, après fusion et
pendant une fusion partielle. Il relit le journal, compte les primitives et la
trajectoire canoniques, vérifie la provenance et la date des fichiers déjà
publiés, refuse une requête modifiée et détecte l'altération du journal.

`test_snapshot_publish_retry.js` qualifie séparément six tentatives maximum de
publication de snapshot, la récupération d'EPERM transitoires, les collisions,
l'échec permanent sans index publié et le refus d'un payload altéré.
