# ADR 0380 — Journal de reprise des restaurations d'organisme

Statut : accepté
Date : 2026-10-10
Domaine : snapshots, reprise, persistance
Décideurs : équipe GenOS
Lié à : [ADR 0367](0367-sections-durables-snapshot-organisme.md), [ADR 0368](0368-reprise-curseur-mission-et-frontieres-runtime.md)

## Contexte

La restauration copie les fichiers du workspace, sélectionne les curseurs des
missions Rust puis valide les données SQLite. Une panne entre ces étapes peut
laisser les supports dans des états différents. Le rollback en mémoire du
processus ne fonctionne pas après un arrêt brutal.

## Décision

- Avant toute mutation, capturer un snapshot de sécurité du workspace et
  enregistrer dans SQLite son identifiant et son empreinte, les références des
  curseurs Rust précédents et les références cibles. Cette insertion bloque
  l'agent dans la même transaction. Une seule tentative non résolue est admise
  par agent.
- Marquer la tentative terminée dans la même transaction SQLite que les données
  restaurées. Après une panne avant le commit, la ligne reste en attente et les
  modifications SQLite sont annulées par SQLite.
- Au démarrage, le worker de maintenance réconcilie les lignes en attente avant
  de servir. Les autres workers attendent leur résolution. Il bloque l'agent,
  vérifie le snapshot de sécurité et les références Rust, puis remet les
  fichiers et les curseurs antérieurs. Une preuve manquante ou une erreur laisse
  la tentative et l'agent bloqués et empêche le démarrage du worker de
  maintenance. La reprise peut être retentée au démarrage suivant.

## Limites

Ce protocole est une compensation durable, pas une transaction atomique entre
SQLite, le système de fichiers et Rust. Il ne peut distinguer une modification
hors processus d'un fichier partiellement copié après l'arrêt brutal ; les
écrivains externes doivent être arrêtés pendant la reprise. Une panne après le
commit SQLite mais avant la réponse HTTP peut laisser le client sans accusé de
réception, alors que la restauration est terminée. La reprise conserve l'agent
bloqué jusqu'à une décision explicite de redémarrage. Un verrou de mission Rust
abandonné par un arrêt brutal ne porte pas de preuve de propriétaire : il
empêche la reprise automatique et demande une vérification opérateur.

## Vérification

`test_organism_restore_sigkill.js` arrête un processus enfant à cinq frontières
du protocole : journal préparé, fichiers restaurés, tête Rust sélectionnée,
transaction SQLite non validée, puis transaction validée. Le parent rouvre la
base SQLite et appelle la récupération avec de vrais fichiers de workspace et
de vrais fichiers de checkpoint Rust. Le test appelle les mêmes services de
snapshot, de curseur et de journal que le contrôleur, mais ne passe pas par
l'API HTTP ni par le démarrage complet du backend. Il ne couvre pas un verrou
Rust abandonné, les écritures externes simultanées ou une panne de stockage.
