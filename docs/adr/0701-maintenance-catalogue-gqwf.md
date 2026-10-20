# ADR 0701 — Réconcilier et borner le catalogue GQWF

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Domaine** : GQWF, CAS, reprise, rétention, intégrité
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0635, ADR 0639, ADR 0643

## Contexte

L'ADR 0643 publie chaque catalogue GQWF après le commit de son état SQLite.
Un arrêt entre ces deux opérations laisse une révision valide dans
`gqwf_catalog_state`, sans ref correspondante. Un checkpoint ultérieur pouvait
créer une nouvelle révision sans republier explicitement la précédente.

Les refs étaient en outre append-only. Cette propriété facilite l'audit, mais
fait croître sans borne le nombre d'entrées du filesystem alors que les objets
de catalogue sont déjà immuables et adressés par contenu.

## Décision

Introduire `gqwf-catalog-maintenance-v1` et exécuter sa maintenance avant et
après chaque checkpoint de métadonnées. Une API explicite
`maintainMetadataCatalog` permet la même reprise sans créer une nouvelle
révision.

La maintenance compare la dernière ref publiée à `gqwf_catalog_state`. Si
l'état SQLite est plus récent, elle relit les objets CAS en remontant
`previousCatalogHash`, vérifie chaque liaison de workspace, révision et hash,
puis republie idempotemment la ref manquante. Une ref plus récente que l'état,
une divergence de chaîne, deux hashes pour une même révision ou un objet CAS
altéré provoquent un échec fermé.

Après réconciliation, seules les 64 refs les plus récentes sont conservées.
Les objets CAS qu'elles désignent ne sont jamais supprimés par cette politique.
Une ref ancienne supprimée reste donc reconstructible depuis la chaîne CAS et
la réponse de maintenance expose précisément les révisions élaguées.

La validation de publication reste distincte de la validation de restauration.
Elle vérifie la chaîne et sa structure, mais n'impose pas aux matérialiseurs
externes le confinement de chemin exigé lorsqu'un bail est reconstruit dans
SQLite.

## Conséquences

### Positives

- La fenêtre commit SQLite → publication de ref devient récupérable sans créer
  un nouvel état logique.
- Le nombre de refs de catalogue est borné à 64 par workspace.
- L'élagage ne détruit aucune donnée de catalogue adressée par contenu.
- Les forks, collisions, chaînes incomplètes et corruptions restent bloquants.
- Les backends de matérialisation externes conservent leur contrat existant.

### Négatives et limites

- Les objets CAS anciens restent présents ; leur collecte demandera une
  politique séparée avec preuve de rétention.
- Les 64 refs représentent une fenêtre opérationnelle, pas une durée garantie.
- La durabilité dépend toujours des garanties de synchronisation du filesystem.
- Cette tranche ne reconstruit ni vues, ni overlays, ni sessions d'exécution.

## Alternatives

### Écraser une ref `latest`

Rejeté : un pointeur unique mutable perd l'historique local et rend une écriture
partielle plus ambiguë.

### Supprimer aussi les objets CAS anciens

Rejeté : une ref n'est pas une preuve suffisante qu'un objet n'est plus requis
par un reçu, une sauvegarde ou une investigation.

### Ignorer une révision non publiée et créer la suivante

Rejeté : cette option masque la fenêtre de crash et brise la continuité
observable de publication.

## Validation

- `node backend/tests/test_gqwf_catalog_maintenance.js` couvre la republication
  après suppression de la dernière ref, l'idempotence, la rétention à 64 refs,
  la conservation des objets CAS, le refus d'un fork et le refus d'un objet
  altéré.
- `node backend/tests/test_gqwf_metadata_repair.js` vérifie que la reconstruction
  SQLite reste compatible.
- `node backend/tests/test_gqwf_fabric.js` vérifie les matérialiseurs existants.
